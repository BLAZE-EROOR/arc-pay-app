export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Test if API key exists
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API key not found in environment" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        messages: [{ role: "user", content: "Reply with this exact JSON only: [{\"icon\":\"✅\",\"text\":\"AI is working!\"}]" }]
      })
    });

    const data = await response.json();
    console.log("Full response:", JSON.stringify(data));

    if (data.error) {
      return res.status(500).json({ error: data.error.message, type: data.error.type });
    }

    const text = data.content[0].text.trim();
    const suggestions = JSON.parse(text);
    res.status(200).json({ suggestions });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}