// src/services/ai/AIService.ts

import {
  GoogleGenerativeAI,
  SchemaType,
  TaskType,
  type GenerationConfig,
  type Schema,
} from "@google/generative-ai";
import type { AICategorizationResponse } from "../../types/index.js";
import config from "../../config/index.js";

// The list of valid categories, defined once.
const validCategories = [
  "Interested",
  "Meeting Booked",
  "Not Interested",
  "Spam",
  "Out of Office",
  "Uncategorized",
];

// The schema for the AI's response, using the constant above.
const categorizationSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    category: {
      type: SchemaType.STRING,
      format: "enum", // Correctly added as per your debugging
      enum: validCategories,
    },
  },
  required: ["category"],
};

export class AIService {
  private genAI: GoogleGenerativeAI | null = null;
  private categorizationModel: any | null = null;
  private generationModel: any | null = null;

  constructor() {
    if (config.ai.provider === "gemini" && config.ai.apiKey) {
      this.genAI = new GoogleGenerativeAI(config.ai.apiKey);

      const generationConfig: GenerationConfig = {
        responseMimeType: "application/json",
        responseSchema: categorizationSchema,
        temperature: 0,
      };

      this.categorizationModel = this.genAI.getGenerativeModel({
        model: config.ai.model,
        generationConfig,
        systemInstruction: `You are an expert email classifier for a professional inbox. Analyze emails and categorize them:

- **Interested**: Job offers, job opportunities, interview invitations, tech updates, software releases, tech news, product launches, industry insights, conference invitations, career opportunities, internship offers, recruitment emails, technical newsletters, developer updates, and any career-related or technology content.
- **Meeting Booked**: Emails confirming scheduled meetings or calendar invitations.
- **Not Interested**: Sales pitches, marketing emails, or content not related to jobs or tech.
- **Spam**: Obvious promotional spam, phishing attempts, or irrelevant bulk mail.
- **Out of Office**: Auto-replies indicating absence.
- **Uncategorized**: Everything else.

Focus: Prioritize job-related and tech-related content as "Interested".`,
      });

      // 2. Model for creative text Generation (Phase 6) - with system instruction
      this.generationModel = this.genAI.getGenerativeModel({
        model: config.ai.model,
        systemInstruction: `You are a helpful assistant that writes professional, relevant email replies. Be concise and professional.`,
      });
    }
  }

  async categorizeEmail(email: {
    subject: string;
    body: string;
    from: string;
  }): Promise<AICategorizationResponse> {
    if (!this.categorizationModel) {
      console.warn("⚠️  AI service not configured, returning default category");
      return { category: "Uncategorized" };
    }

    try {
      const prompt = `
        From: ${email.from}
        Subject: ${email.subject}
        Body: ${email.body.substring(0, 4000)}
      `.trim();

      const result = await this.categorizationModel.generateContent(prompt);
      const response = await result.response;

      const jsonResponse = JSON.parse(response.text());
      const category = jsonResponse.category;

      // Use the constant for validation
      if (category && validCategories.includes(category)) {
        return { category };
      }

      return { category: "Uncategorized" };
    } catch (error) {
      console.error("❌ Error categorizing email:", error);
      return { category: "Uncategorized" };
    }
  }

  async generateReply(
    emailContent: string,
    contexts?: string[]
  ): Promise<string> {
    if (!this.generationModel) {
      throw new Error("AI service not configured");
    }

    try {
      let prompt = `
**Original Email:**
${emailContent}
`;

      if (contexts && contexts.length > 0) {
        prompt += `\n**Retrieved Context:**
${contexts.join("\n---\n")}
`;
      }

      prompt += `\n**Task:**
Draft a professional and helpful reply to the above email.`;

      // Start chat without systemInstruction (it's already set in the model)
      const chat = this.generationModel.startChat();

      const result = await chat.sendMessage(prompt.trim());
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("❌ Error generating reply:", error);
      throw error;
    }
  }
}

export default new AIService();
