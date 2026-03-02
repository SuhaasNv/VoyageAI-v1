/**
 * Test script for Groq API
 * Run: npx tsx scripts/test-groq.ts
 */

import "dotenv/config";

async function testGroq() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.error("❌ GROQ_API_KEY is not set in .env");
    process.exit(1);
  }

  console.log("🔑 API Key:", apiKey.substring(0, 12) + "...");
  console.log("⏳ Sending test request to Groq...");
  console.log("");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 50,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Groq API error:", response.status);
      console.error("   Response:", JSON.stringify(data, null, 2));
      if (response.status === 401) console.error("\n💡 Hint: Invalid API key. Get one at https://console.groq.com");
      if (response.status === 429) console.error("\n💡 Hint: Rate limit exceeded. Try again later.");
      process.exit(1);
    }

    const content = data.choices?.[0]?.message?.content ?? "(empty)";
    console.log("✅ Success!");
    console.log("📝 Response:", content);
    console.log("");
    console.log("Your Groq API is working correctly.");
  } catch (err: unknown) {
    const e = err as Error;
    console.error("❌ Groq API test failed:", e.message);
    process.exit(1);
  }
}

testGroq();
