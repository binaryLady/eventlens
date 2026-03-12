// @TheTechMargin 2026
import { config } from "./config";

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
  error?: { message: string };
}

function parseGeminiJson(response: string): unknown {
  return JSON.parse(
    response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(),
  );
}

async function callGemini(parts: GeminiPart[], model = "gemini-2.5-flash-lite"): Promise<string> {
  const { geminiApiKey } = config;
  if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data: GeminiResponse = await res.json();
  if (data.error) throw new Error(`Gemini error: ${data.error.message}`);

  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function describePersonForMatching(
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  return callGemini([
    {
      text: `You are analyzing a selfie/photo to find this person in a large set of event photos.

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

If no person is clearly visible, respond with exactly: NO_PERSON_DETECTED`,
    },
    { inline_data: { mime_type: mimeType, data: imageBase64 } },
  ]);
}

export async function verifyFaceMatches(
  uploadedImageBase64: string,
  uploadedMimeType: string,
  candidateThumbnails: Array<{ id: string; imageBase64: string; mimeType: string }>,
): Promise<Array<{ id: string; confidence: number; reason: string }>> {
  if (candidateThumbnails.length === 0) return [];

  const parts: GeminiPart[] = [
    {
      text: `You are an expert face matching system. Your job is to determine if the SAME PERSON from the reference photo appears in any of the event photos below.

REFERENCE PHOTO (the person we are looking for):`,
    },
    { inline_data: { mime_type: uploadedMimeType, data: uploadedImageBase64 } },
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
    parts.push({ text: `\nEVENT PHOTO ${i + 1} (id: ${candidateThumbnails[i].id}):` });
    parts.push({
      inline_data: {
        mime_type: candidateThumbnails[i].mimeType,
        data: candidateThumbnails[i].imageBase64,
      },
    });
  }

  const response = await callGemini(parts);

  try {
    const parsed = parseGeminiJson(response);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m: { confidence?: number }) => typeof m.confidence === "number" && m.confidence >= 35)
      .map((m: { id: string; confidence: number; reason?: string }) => ({
        id: String(m.id),
        confidence: m.confidence,
        reason: m.reason || "Visual match",
      }));
  } catch {
    return [];
  }
}

export async function pickHeroImage(
  thumbnails: Array<{ base64: string; mimeType: string }>,
): Promise<number> {
  if (thumbnails.length <= 1) return 0;

  const parts: GeminiPart[] = [
    {
      text: `You are selecting the best "hero" image for a photo collage from an event. Pick the ONE image that is most visually striking, best composed, and most representative of the event energy. Respond with ONLY the 1-based index number of that image, nothing else.`,
    },
  ];

  for (let i = 0; i < thumbnails.length; i++) {
    parts.push({ text: `\nImage ${i + 1}:` });
    parts.push({
      inline_data: {
        mime_type: thumbnails[i].mimeType,
        data: thumbnails[i].base64,
      },
    });
  }

  const response = await callGemini(parts);
  const index = parseInt(response.trim(), 10);

  if (isNaN(index) || index < 1 || index > thumbnails.length) return 0;
  return index - 1; // Convert to 0-based
}

export async function analyzeEventPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<{
  visible_text: string;
  people_descriptions: string;
  scene_description: string;
  face_count: number;
}> {
  const response = await callGemini([
    {
      text: `Analyze this event photo and provide structured information in JSON format.

Return ONLY valid JSON with this exact structure:
{
  "visible_text": "any text visible in the photo (signs, banners, clothing text, etc.) - if none, use empty string",
  "people_descriptions": "brief descriptions of people visible, separated by semicolons - focus on appearance, clothing, activities",
  "scene_description": "description of the setting, event type, atmosphere, and notable objects",
  "face_count": number of distinct faces visible in the photo
}

Be specific and factual. For visible_text, only include actual readable text. For people_descriptions, describe each person briefly. For scene_description, describe the environment and context.`,
    },
    { inline_data: { mime_type: mimeType, data: imageBase64 } },
  ]);

  try {
    const parsed = parseGeminiJson(response) as Record<string, unknown>;
    return {
      visible_text: String(parsed.visible_text || ""),
      people_descriptions: String(parsed.people_descriptions || ""),
      scene_description: String(parsed.scene_description || ""),
      face_count: typeof parsed.face_count === "number" ? parsed.face_count : 0,
    };
  } catch {
    return { visible_text: "", people_descriptions: "", scene_description: "", face_count: 0 };
  }
}
