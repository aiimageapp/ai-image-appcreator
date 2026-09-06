export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

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

    // Submit generation to the official FLUX.1 Schnell ZeroGPU Space
    const submit = await fetch(
      "https://black-forest-labs-flux-1-schnell.hf.space/gradio_api/call/infer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          data: [
            prompt.trim(),
            0,
            true,
            width,
            height,
            4
          ]
        })
      }
    );

    if (!submit.ok) {
      const text = await submit.text();

      throw new Error(
        `Image service error (${submit.status}): ${text}`
      );
    }

    const submitData = await submit.json();

    const eventId = submitData.event_id;

    if (!eventId) {
      throw new Error("Image generation queue did not return an event ID.");
    }

    // Poll the Gradio event stream
    const resultResponse = await fetch(
      `https://black-forest-labs-flux-1-schnell.hf.space/gradio_api/call/infer/${eventId}`
    );

    if (!resultResponse.ok) {
      const text = await resultResponse.text();

      throw new Error(
        `Generation result error (${resultResponse.status}): ${text}`
      );
    }

    const streamText = await resultResponse.text();

    // Find the completed event
    const events = streamText.split("\n\n");

    let resultData = null;

    for (const event of events) {
      if (event.includes("event: complete")) {
        const dataLine = event
          .split("\n")
          .find(line => line.startsWith("data:"));

        if (dataLine) {
          const jsonText = dataLine.substring(5).trim();
          resultData = JSON.parse(jsonText);
        }
      }

      if (event.includes("event: error")) {
        const dataLine = event
          .split("\n")
          .find(line => line.startsWith("data:"));

        throw new Error(
          dataLine
            ? dataLine.substring(5).trim()
            : "Image generation failed."
        );
      }
    }

    if (!resultData || !resultData[0]) {
      throw new Error(
        "The image service did not return an image."
      );
    }

    const imageResult = resultData[0];

    // Gradio may return a file object or URL
    let imageUrl = null;

    if (typeof imageResult === "string") {
      imageUrl = imageResult;
    } else if (imageResult.url) {
      imageUrl = imageResult.url;
    } else if (imageResult.path) {
      imageUrl =
        "https://black-forest-labs-flux-1-schnell.hf.space/file=" +
        encodeURIComponent(imageResult.path);
    }

    if (!imageUrl) {
      throw new Error("Could not locate the generated image.");
    }

    // Download generated image
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      throw new Error(
        `Could not download generated image (${imageResponse.status}).`
      );
    }

    const imageBuffer = Buffer.from(
      await imageResponse.arrayBuffer()
    );

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", imageBuffer.length);

    return res.status(200).send(imageBuffer);

  } catch (error) {
    console.error("Image generation error:", error);

    return res.status(500).json({
      error: error?.message || "Image generation failed."
    });
  }
}