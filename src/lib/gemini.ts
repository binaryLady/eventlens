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
 * Phase 1: Analyze the uploaded photo and describe the person in detail
 * for matching against event photo descriptions.
 */
export async function describePersonForMatching(
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  const prompt = `You are analyzing a photo to help find this person in event photos.

Describe the person in this photo with specific, searchable attributes. Focus on:
- Hair: color, length, style (e.g., "short brown hair", "long blonde curly hair")
- Skin tone and approximate ethnicity if clearly visible
- Clothing: colors, type, patterns (e.g., "red plaid shirt", "blue blazer")
- Accessories: glasses, hat, jewelry, lanyard, badge
- Facial hair: beard, mustache, clean-shaven
- Build: approximate build
- Any other distinctive features

Output ONLY the description as comma-separated attributes, nothing else.
Example: "short brown hair, glasses, blue polo shirt, beard, lanyard with badge"

If no person is clearly visible, respond with "NO_PERSON_DETECTED".`;

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
 * Phase 3: Visual face matching — send the uploaded photo and a batch of
 * candidate thumbnails to Gemini for face comparison.
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

  // Build the prompt with numbered candidate images
  const parts: GeminiPart[] = [
    {
      text: `You are a face matching system for an event photo finder app.

REFERENCE PHOTO (the person we're looking for):`,
    },
    {
      inline_data: {
        mime_type: uploadedMimeType,
        data: uploadedImageBase64,
      },
    },
    {
      text: `\nBelow are ${candidateThumbnails.length} EVENT PHOTOS numbered 1 through ${candidateThumbnails.length}.
For each photo, determine if the SAME PERSON from the reference photo appears in it.

Consider: face shape, hair, skin tone, glasses, and overall appearance.
Clothing may differ between photos — focus on facial features.

Respond in JSON format ONLY (no markdown, no backticks):
[{"id": "<photo_id>", "confidence": <0-100>, "reason": "<brief reason>"}]

Only include photos where confidence >= 30. If no matches, return [].
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
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonStr = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (m: { confidence?: number }) =>
            typeof m.confidence === "number" && m.confidence >= 30,
        )
        .map((m: { id: string; confidence: number; reason?: string }) => ({
          id: String(m.id),
          confidence: m.confidence,
          reason: m.reason || "",
        }));
    }
  } catch {
    console.error("Failed to parse Gemini face match response:", response);
  }

  return [];
}
