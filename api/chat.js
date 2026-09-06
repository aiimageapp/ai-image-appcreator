export default async function handler(req, res) {
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
    const { message } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    const response = await fetch(
      "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.HF_TOKEN}`
        },
        body: JSON.stringify({
          inputs: message.trim(),
          parameters: {
            max_new_tokens: 500,
            temperature: 0.7,
            return_full_text: false
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error || "AI service error."
      );
    }

    let answer = "";

    if (Array.isArray(data) && data[0]?.generated_text) {
      answer = data[0].generated_text;
    } else if (data?.generated_text) {
      answer = data.generated_text;
    }

    if (!answer) {
      throw new Error("AI did not return a response.");
    }

    return res.status(200).json({
      answer
    });

  } catch (error) {
    console.error("Chat error:", error);

    return res.status(500).json({
      error: error?.message || "AI chat failed."
    });
  }
}