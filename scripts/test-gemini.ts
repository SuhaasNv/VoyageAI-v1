/**
 * Test script for Gemini API
 * Run: npx tsx scripts/test-gemini.ts
 */

import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is not set in .env");
    process.exit(1);
  }

  console.log("🔑 API Key:", apiKey.substring(0, 10) + "...");
  console.log("📦 Model:", modelName);
  console.log("");

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 100,
      },
    });

    console.log("⏳ Sending test request...");
    const result = await model.generateContent("Say hello in one word.");
    const text = result.response.text();

    console.log("✅ Success!");
    console.log("📝 Response:", text);
    console.log("");
    console.log("Your Gemini API is working correctly.");
  } catch (err: unknown) {
    const e = err as Error;
    console.error("❌ Gemini API test failed:");
    console.error("   Message:", e.message);
    if (e.cause) console.error("   Cause:", e.cause);

    // Common error hints
    if (e.message?.includes("404") || e.message?.includes("not found")) {
      console.error("\n💡 Hint: Model name may be invalid. Try GEMINI_MODEL=gemini-1.5-flash");
    }
    if (e.message?.includes("403") || e.message?.includes("401") || e.message?.includes("API key")) {
      console.error("\n💡 Hint: Check your API key at https://aistudio.google.com/apikey");
    }
    if (e.message?.includes("429") || e.message?.includes("quota")) {
      console.error("\n💡 Hint: Rate limit or quota exceeded. Try again later.");
    }

    process.exit(1);
  }
}

testGemini();
