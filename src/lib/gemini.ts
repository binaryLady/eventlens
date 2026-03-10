import { config } from "./config";

interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
  error?: { message: string };
}

async function callGemini(parts: GeminiPart[]): Promise<string> {
  const { geminiApiKey } = config;
  if (!geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data: GeminiResponse = await res.json();
  if (data.error) {
    throw new Error(`Gemini error: ${data.error.message}`);
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

/**
 * Phase 1: Analyze the uploaded selfie and produce a structured description
 * optimized for matching against event photo people descriptions.
 *
 * Key improvements:
 *   - Output structured attributes that align with how apps-script indexes photos
 *   - Focus on PERSISTENT features (face shape, hair, skin tone, glasses)
 *     over transient ones (expression, pose)
 *   - Produce both specific terms and broader category terms for flexible matching
 */
export async function describePersonForMatching(
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  const prompt = `You are analyzing a selfie/photo to find this person in a large set of event photos.

Describe this person using SPECIFIC, SEARCHABLE attributes. Prioritize PERSISTENT physical features over clothing (clothing helps but faces are primary).

Output format: comma-separated attributes, grouped by category. Example:
"male, dark skin, short black hair, beard, glasses, mid-30s, blue polo shirt, lanyard"

Categories to cover (in order of matching importance):
1. GENDER: male/female/non-binary presentation
2. SKIN TONE: light, medium, dark, etc.
3. HAIR: color + length + style (e.g., "long blonde curly hair", "bald", "short brown hair")
4. FACIAL HAIR: beard, mustache, goatee, clean-shaven
5. GLASSES: glasses, sunglasses, no glasses
6. AGE RANGE: approximate decade (20s, 30s, 40s, etc.)
7. BUILD: slim, medium, heavy
8. CLOTHING: top color + type (e.g., "red flannel shirt", "black hoodie")
9. ACCESSORIES: hat, lanyard, badge, jewelry, headphones
10. DISTINCTIVE FEATURES: tattoos, piercings, unique characteristics

Be precise with colors (don't say "dark shirt" — say "black t-shirt" or "navy blazer").
Output ONLY the comma-separated description, nothing else.

If no person is clearly visible, respond with exactly: NO_PERSON_DETECTED`;

  return callGemini([
    { text: prompt },
    {
      inline_data: {
        mime_type: mimeType,
        data: imageBase64,
      },
    },
  ]);
}

/**
 * Phase 2: Visual face matching — compare the reference selfie against
 * a batch of event photo thumbnails.
 *
 * Key improvements over v1:
 *   - Structured output format with explicit face-feature comparison
 *   - Focus on facial geometry (face shape, eye spacing, nose, jawline)
 *   - De-emphasize clothing since it changes between photos
 *   - Require reasoning before confidence score
 *   - Tighter confidence calibration guidance
 */
export async function verifyFaceMatches(
  uploadedImageBase64: string,
  uploadedMimeType: string,
  candidateThumbnails: Array<{
    id: string;
    imageBase64: string;
    mimeType: string;
  }>,
): Promise<Array<{ id: string; confidence: number; reason: string }>> {
  if (candidateThumbnails.length === 0) return [];

  const parts: GeminiPart[] = [
    {
      text: `You are an expert face matching system. Your job is to determine if the SAME PERSON from the reference photo appears in any of the event photos below.

REFERENCE PHOTO (the person we are looking for):`,
    },
    {
      inline_data: {
        mime_type: uploadedMimeType,
        data: uploadedImageBase64,
      },
    },
    {
      text: `
Below are ${candidateThumbnails.length} EVENT PHOTOS. For each one, compare faces carefully.

MATCHING CRITERIA (in priority order):
1. FACE SHAPE & STRUCTURE: jawline, forehead shape, cheekbones
2. EYES: shape, spacing, brow line
3. NOSE: size, shape, bridge width
4. SKIN TONE: should be consistent (accounting for lighting)
5. HAIR: color, style, hairline (but people can change hairstyles)
6. FACIAL HAIR: beard, mustache presence (can change but informative)
7. GLASSES: frame style if present (can be removed/changed)
8. BUILD & POSTURE: body type consistency

IGNORE: clothing, background, expression, pose, lighting differences.

CONFIDENCE CALIBRATION:
- 80-99: Very confident match — multiple facial features clearly match
- 60-79: Likely match — face structure matches, some features unclear due to angle/lighting
- 40-59: Possible match — some similarities but can't confirm due to image quality or angle
- Below 40: Not a match or too uncertain

Respond in JSON format ONLY (no markdown, no backticks):
[{"id": "<photo_id>", "confidence": <0-100>, "reason": "<which facial features matched or didn't>"}]

Only include photos where confidence >= 35. If no matches, return [].
`,
    },
  ];

  for (let i = 0; i < candidateThumbnails.length; i++) {
    parts.push({
      text: `\nEVENT PHOTO ${i + 1} (id: ${candidateThumbnails[i].id}):`,
    });
    parts.push({
      inline_data: {
        mime_type: candidateThumbnails[i].mimeType,
        data: candidateThumbnails[i].imageBase64,
      },
    });
  }

  const response = await callGemini(parts);

  try {
    const jsonStr = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (m: { confidence?: number }) =>
            typeof m.confidence === "number" && m.confidence >= 35,
        )
        .map((m: { id: string; confidence: number; reason?: string }) => ({
          id: String(m.id),
          confidence: m.confidence,
          reason: m.reason || "Visual match",
        }));
    }
  } catch {
    console.error("Failed to parse Gemini face match response:", response);
  }

  return [];
}

// ── Photo indexing (replaces Apps Script analyzeImage_) ───────────────────

export interface PhotoAnalysis {
  visible_text: string;
  people_descriptions: string;
  scene_description: string;
  face_count: number;
}

/**
 * Analyze an event photo with Gemini — produces the same structured output
 * that the Google Apps Script used to write to the Sheet.
 *
 * This is the in-app replacement for scripts/apps-script.gs analyzeImage_().
 */
export async function analyzeEventPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<PhotoAnalysis> {
  const prompt = `Analyze this event photo. Return ONLY valid JSON with these fields:
{
  "visible_text": "ALL text visible in the image - banners, signs, screens, t-shirts, lanyards, stickers, name tags. Include everything, even partial text. If no text, return empty string.",
  "people_descriptions": "For EACH person visible, provide a structured description using this format separated by semicolons: [gender], [skin tone], [hair color] [hair length] [hair style], [facial hair or clean-shaven], [glasses/no glasses], [age range], [build], [clothing color and type], [accessories], [any distinctive features]. Be SPECIFIC with colors (say navy blazer not dark jacket). Example: male, medium skin, short black hair, beard, glasses, 30s, medium build, blue polo shirt, lanyard with badge; female, light skin, long blonde hair, no glasses, 20s, slim, red flannel shirt, no accessories",
  "scene_description": "Brief description of what is happening - presentation, networking, coding, panel, etc. Include notable objects like laptops, microphones, whiteboards.",
  "face_count": number_of_faces_visible
}
Be thorough with visible_text and people_descriptions - both are used for search and face matching. Return ONLY the JSON, no markdown formatting.`;

  const response = await callGemini([
    {
      inline_data: {
        mime_type: mimeType,
        data: imageBase64,
      },
    },
    { text: prompt },
  ]);

  // Clean up Gemini response (same as apps-script.gs cleanup)
  const text = response
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim()
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in Gemini response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    visible_text: String(parsed.visible_text || ""),
    people_descriptions: String(parsed.people_descriptions || ""),
    scene_description: String(parsed.scene_description || ""),
    face_count: parseInt(String(parsed.face_count || "0"), 10) || 0,
  };
}
