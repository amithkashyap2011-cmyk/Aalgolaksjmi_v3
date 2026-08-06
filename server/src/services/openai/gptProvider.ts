import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function askGPT(prompt: string): Promise<string> {
  const response = await client.responses.create({
    model: "gpt-5",
    input: prompt,
  });

  return response.output_text;
}
