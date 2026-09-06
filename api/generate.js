import { InferenceClient } from "@huggingface/inference";

const hf = new InferenceClient(process.env.HF_TOKEN);

export default async function handler(req, res) {
  // Allow only POST
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { prompt, ratio } = req.body || {};

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        error: "Please enter an image prompt."
      });
    }

    // Choose image dimensions from the selected ratio
    let width = 1024;
    let height = 1024;

    if (ratio === "16:9") {
      width = 1024;
      height = 576;
    } else if (ratio === "9:16") {
      width = 576;
      height = 1024;
    } else if (ratio === "4:3") {
      width = 1024;
      height = 768;
    } else if (ratio === "3:4") {
      width = 768;
      height = 1024;
    }

    const imageBlob = await hf.textToImage({
      model: "black-forest-labs/FLUX.1-dev",
      inputs: prompt.trim(),
      provider: "auto",
      parameters: {
        width,
        height
      }
    });

    const buffer = Buffer.from(await imageBlob.arrayBuffer());

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", buffer.length);

    return res.status(200).send(buffer);

  } catch (error) {
    console.error("Hugging Face error:", error);

    return res.status(500).json({
      error: error?.message || "Image generation failed."
    });
  }
}