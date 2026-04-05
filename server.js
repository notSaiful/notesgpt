require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");
const { createClient } = require("@supabase/supabase-js");

// ── Supabase Init ────────────────────────────────────────────
let supabase = null;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log("🔐 Supabase initialized");
} else {
  console.warn("⚠️  Supabase not configured — auth features disabled. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env");
}

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Free models to try (best quality + speed first) ─────────
const FREE_MODELS = [
  "google/gemini-2.0-flash-001:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen3.6-plus-preview:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "google/gemma-3-4b-it:free",
  "stepfun/step-3.5-flash:free",
  "openrouter/free",
];

// ── Subject mapping per class ────────────────────────────────
const SUBJECTS_BY_CLASS = {
  "6":  ["Maths", "Science", "Social Science", "English", "Hindi"],
  "7":  ["Maths", "Science", "Social Science", "English", "Hindi"],
  "8":  ["Maths", "Science", "Social Science", "English", "Hindi"],
  "9":  ["Maths", "Science", "Social Science", "English", "Hindi"],
  "10": ["Maths", "Science", "Social Science", "English", "Hindi"],
  "11": ["Physics", "Chemistry", "Biology", "Maths", "English", "Economics", "Business Studies", "Accountancy", "Political Science", "History"],
  "12": ["Physics", "Chemistry", "Biology", "Maths", "English", "Economics", "Business Studies", "Accountancy", "Political Science", "History"],
};

// ── Endpoint: subjects for a class ───────────────────────────
app.get("/api/subjects/:classNum", (req, res) => {
  const classNum = req.params.classNum;
  const subjects = SUBJECTS_BY_CLASS[classNum];
  if (!subjects) {
    return res.status(400).json({ error: "Invalid class selected." });
  }
  res.json({ subjects });
});

// ── Prompt builders (Exam-Cracking Focus) ────────────────────
function buildNotesPrompt(classNum, subject, chapter, topic) {
  const isBoard = ["10", "12"].includes(classNum);
  const examType = isBoard ? "CBSE Board Examination" : `CBSE Class ${classNum} Annual Examination`;
  const topicLine = topic
    ? `\nFOCUS SPECIFICALLY on the topic: "${topic}" within this chapter. Cover this topic in depth — explain it thoroughly with examples, formulas, and exam tips. Do not cover the entire chapter, only this specific topic.`
    : "";

  return `You are an expert CBSE exam preparation tutor for Class ${classNum} ${subject}. Your ONLY goal is to help the student score FULL MARKS in their ${examType}.

Generate study notes for the chapter: "${chapter}" in subject: "${subject}".${topicLine}

CRITICAL INSTRUCTIONS:
- Base your content STRICTLY on the NCERT textbook for Class ${classNum} ${subject}. Do NOT include anything outside the NCERT syllabus.
- Prioritize topics and concepts that have appeared REPEATEDLY in previous year CBSE question papers (PYQs) for Class ${classNum}.
- For Class ${isBoard ? classNum : classNum}, focus on the types of questions that examiners actually ask — definitions, derivations, diagram-based, numerical, and application-based.
- Highlight which points carry marks in board/annual exams and how to write answers to get full marks.
- Include "Examiner's Favourite" tags next to points that appear frequently in PYQs.

Format the output strictly as:

## 1. ${topic ? `Topic Overview: ${topic}` : "Chapter Overview"}
(3-5 lines, simple explanation as per NCERT)

## 2. Key Concepts (Most Tested in Exams)
(bullet points — tag each with ⭐ if it appeared in 3+ previous year papers)

## 3. Important Formulas / Definitions
(if applicable — include EXACT NCERT definitions that examiners expect)

## 4. Previous Year Exam Patterns
- List the types of questions asked from this chapter in past ${examType}s
- Mention which topics get 1-mark, 2-mark, 3-mark, and 5-mark questions
- Note any "guaranteed" questions that appear almost every year

## 5. How to Write Answers for Full Marks
- Step-by-step answer writing tips specific to this chapter
- What key points/keywords the examiner looks for
- Common mistakes students make that cost them marks

## 6. Quick Revision Summary (Last-Minute Exam Prep)
(10-15 one-liner points — the absolute essentials to revise before walking into the exam hall)

Ensure EVERY point directly helps the student score marks in their ${examType}. Remove all filler content. Language must be simple, clear, and Class ${classNum} appropriate.`;
}

function buildFlashcardPrompt(classNum, subject, chapter) {
  const isBoard = ["10", "12"].includes(classNum);
  const examType = isBoard ? "CBSE Board Examination" : `CBSE Class ${classNum} Annual Examination`;

  return `You are a CBSE exam preparation expert for Class ${classNum} ${subject}. Generate flashcards for the chapter: "${chapter}" that will help the student score FULL MARKS in their ${examType}.

CRITICAL INSTRUCTIONS:
- Every flashcard MUST test a concept that is LIKELY TO APPEAR in the ${examType}.
- Prioritize: NCERT textbook definitions (word-for-word), key formulas, diagram labels, frequently tested concepts from previous year papers.
- For Class 10/12 Board exams: focus on 1-mark objective questions, important definitions, and formula-based quick recalls.
- For Class 6-9: focus on chapter-end exercise questions, fill-in-the-blanks, and key terms.
- Do NOT include obscure or rarely tested content. Every card must be HIGH-YIELD for exam scoring.

Rules:
- Create 15-25 flashcards
- Each flashcard must be answerable in 2-5 seconds
- Answers must be EXACTLY as written in the NCERT textbook (examiners check for NCERT language)
- No long explanations

Format strictly as a JSON array (no other text, no markdown, just the JSON):

[
  {
    "type": "definition",
    "question": "Front side question (as it would appear in exam)",
    "answer": "Short, precise answer (NCERT-accurate)"
  }
]

The "type" field must be one of: "definition", "formula", "concept"

Focus ONLY on:
- NCERT definitions that examiners ask word-for-word
- Formulas that appear in numericals every year
- Concepts from previous year question papers
- Diagram labels and key terms frequently tested
- Chapter-end NCERT exercise answers (these are directly asked in exams)

Keep language simple and optimized for ${examType} scoring.`;
}

function buildQuestionPrompt(classNum, subject, chapter) {
  const isBoard = ["10", "12"].includes(classNum);
  const examType = isBoard ? "CBSE Board Examination" : `CBSE Class ${classNum} Annual Examination`;

  return `You are a CBSE exam paper setter for Class ${classNum} ${subject}. Generate practice questions for the chapter: "${chapter}" that are MOST LIKELY to appear in the upcoming ${examType}.

CRITICAL INSTRUCTIONS:
- Model these questions EXACTLY after previous year CBSE question paper patterns for Class ${classNum}.
- Include questions that have been REPEATED across multiple years — these are "guaranteed" questions.
- For Board classes (10, 12): Follow the EXACT CBSE marking scheme — 1-mark MCQs, 2-mark short answers (SA-I), 3-mark short answers (SA-II), 5-mark long answers (LA), and case-based questions.
- For non-board classes (6-9): Follow annual exam patterns — objective, short answer, long answer, and HOTS (Higher Order Thinking Skills).
- Every question must be solvable using ONLY the NCERT textbook content.
- Include at least 2 questions that appeared in actual previous year papers (mark them with 🔁 PYQ tag).

Rules:
- Generate 10-15 questions (quality over quantity)
- Mix difficulty: 30% easy, 40% medium, 30% hard
- Include:
  - 3 MCQs (with 4 options each, 1 mark) — modeled after CBSE objective patterns
  - 2 assertion-reason questions (if applicable for the subject)
  - 3 short answer (2-3 marks) — the type examiners love to ask
  - 3 long answer (5 marks) — with sub-parts as CBSE formats them
  - 2 case-based/competency-based questions (as per new CBSE pattern)

For EACH question, provide:
- Question text (formatted EXACTLY like a real CBSE paper)
- Step-by-step solution (showing how to write for FULL marks)
- Final answer
- Marks tip (what keywords/steps the examiner checks to award marks)

Format strictly as a JSON array (no other text, no markdown, just the JSON):

[
  {
    "type": "mcq",
    "difficulty": "easy",
    "question": "Question text with options A) B) C) D)",
    "solution_steps": ["Step 1...", "Step 2..."],
    "final_answer": "Option and answer",
    "marks_tip": "How to write for full marks in the actual exam"
  }
]

The "type" field must be one of: "mcq", "short", "long", "case", "assertion"
The "difficulty" field must be one of: "easy", "medium", "hard"

Every question must prepare the student for their ACTUAL ${examType}. No random or irrelevant questions.`;
}

function buildTestPrompt(classNum, subject, chapter) {
  const isBoard = ["10", "12"].includes(classNum);
  const examType = isBoard ? "CBSE Board Examination" : `CBSE Class ${classNum} Annual Examination`;

  return `You are a CBSE examiner creating a chapter-wise test for Class ${classNum} ${subject}, chapter: "${chapter}". This test must simulate the EXACT format and difficulty of the real ${examType}.

CRITICAL INSTRUCTIONS:
- This is a MOCK EXAM. Structure it EXACTLY like a real CBSE question paper section for this chapter.
- Use the EXACT marking scheme that CBSE follows: 1-mark, 2-mark, 3-mark, 5-mark questions.
- Questions must be based ONLY on NCERT content and previous year paper patterns.
- Include at least 2 questions modeled after actual previous year papers.
- For Board exams: include the new competency-based and case-study format questions.
- Total marks should be 25-30 (a realistic chapter test).

Rules:
- Total questions: 10-12
- Mix of:
  - 3 MCQs / Objective (1 mark each) — CBSE board style
  - 3 short answer SA-I (2 marks each)
  - 3 short answer SA-II (3 marks each)
  - 2 long answer (5 marks each) — with sub-parts
  - 1 case-based question (4 marks) — as per new CBSE format
- Follow CBSE exam pattern STRICTLY

For each question include:
- Question text (formatted like a real exam paper)
- Correct/ideal answer (written the way it should be written in the exam for full marks)
- Marks for the question
- Key points required for full marks (what the examiner checks)

Format strictly as a JSON array (no other text, no markdown, just the JSON):

[
  {
    "type": "mcq",
    "question": "Question with A) B) C) D) options",
    "answer": "Correct option and complete answer",
    "marks": 1,
    "key_points": ["Exact keyword/point examiner checks"]
  }
]

The "type" field must be one of: "mcq", "short", "long", "case"

This test must feel like sitting in the actual ${examType}. Quality and exam-accuracy are paramount.`;
}

function buildEvalPrompt(classNum, questionsAndAnswers) {
  const isBoard = ["10", "12"].includes(classNum);
  const examType = isBoard ? "CBSE Board Examination" : `CBSE Class ${classNum} Annual Examination`;

  return `You are an experienced CBSE examiner evaluating a Class ${classNum} student's test answers. Your evaluation must follow the EXACT CBSE marking scheme and evaluation standards used in the real ${examType}.

Here are the questions, correct answers, and student's answers:

${questionsAndAnswers}

CRITICAL EVALUATION INSTRUCTIONS:
- Award marks EXACTLY as a real CBSE examiner would — check for key points, NCERT terminology, correct formulas, and proper answer structure.
- Give step-marking for numerical/derivation questions (partial marks for correct intermediate steps).
- Deduct marks for: missing keywords that CBSE examiners look for, incorrect NCERT terminology, incomplete diagrams, missing units in numerical answers.
- Be encouraging but honest. Identify EXACT weak areas the student needs to fix before their ${examType}.

For EACH question, evaluate the student's answer against the correct answer and key points.

Format strictly as a JSON array (no other text, no markdown, just the JSON):

[
  {
    "marks_awarded": 2,
    "total_marks": 3,
    "feedback": "What was correct and what was missing — referencing CBSE marking standards",
    "improvement_tip": "Specific, actionable tip to score full marks on this type of question in the actual ${examType}"
  }
]

Be fair, follow CBSE step-marking rules, and give partial marks where appropriate. Every tip must be directly actionable for exam improvement.`;
}


// ── Call AI Engine (OpenRouter primary → Bytez fallback) ───────
function buildArenaPrompt(classNum, subject, chapter) {
  const isBoard = ["10", "12"].includes(classNum);
  const examType = isBoard ? "CBSE Board Examination" : `CBSE Class ${classNum} Annual Examination`;

  return `You are a CBSE exam high-performance coach. Your goal is to train a Class ${classNum} student's "exam instincts" for the chapter: "${chapter}" from ${subject}.

Generate 10 rapid-fire "Decision Questions" as a valid JSON array. Each question tests whether the student can identify the correct concept, method, or fact in under 8 seconds.

CRITICAL INSTRUCTIONS:
- Q1-3: EASY (Basic definitions/facts)
- Q4-7: MEDIUM (Concept recognition/Method selection)
- Q8-9: HARD (Error spotting/Formula recall)
- Q10: BOSS QUESTION (Complex multi-concept decision)
- Make questions punchy and short.
- Every question must be solvable via NCERT patterns.

Format strictly as JSON array:
[
  {
    "type": "concept_recognition",
    "difficulty": "easy",
    "question": "The question text",
    "options": ["A) Choice 1", "B) Choice 2", "C) Choice 3", "D) Choice 4"],
    "answer": "Correct Choice",
    "insightRefinement": "Brief tip if they get it wrong (e.g., 'You overcomplicated this')"
  }
]

Question types must be: "concept_recognition", "method_selection", "quick_mcq", "error_spotting".

Make it high-stakes and elite.`;
}

async function callOpenRouter(apiKey, systemMsg, prompt, maxTokens = 2048) {

  // Fallback to Primary Protocol: OpenRouter Free Models
  console.log(`🔌 Initializing OpenRouter Pipeline`);
  for (const model of FREE_MODELS) {
    try {
      console.log(`⏳ Trying model: ${model}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "NotesGPT",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.5,
        }),
      });

      clearTimeout(timeout);

      if (response.ok) {
        let data = await response.json();
        let content = data.choices?.[0]?.message?.content;
        
        // Remove markdown wrappers often injected by Gemini/Flash
        if (content && content.startsWith("\`\`\`json")) {
           content = content.replace(/^\`\`\`json/i, "").replace(/\`\`\`$/i, "").trim();
        }

        if (content) {
          console.log(`✅ Success with ${model}`);
          return content;
        }
        console.warn(`⚠️  ${model} returned empty content`);
      } else {
        const errBody = await response.text();
        console.warn(`⚠️  ${model} failed (${response.status}): ${errBody.slice(0, 150)}`);
        
        // Smart rate-limit handling: if per-minute limit, wait before next model
        if (response.status === 429 && errBody.includes("per-min")) {
          console.log(`⏸️  Per-minute rate limit hit — waiting 5s before next model...`);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    } catch (err) {
      console.warn(`⚠️  ${model} threw exception: ${err.message}`);
    }
  }

  // ── FALLBACK: Bytez API (when ALL OpenRouter models are exhausted) ──
  const bytezKey = process.env.BYTEZ_API_KEY;
  if (bytezKey) {
    // Bytez free tier: "sm" models only, 1 request at a time
    const BYTEZ_MODELS = [
      "Qwen/Qwen2-1.5B-Instruct",
      "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
      "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    ];

    console.log(`🔌 OpenRouter exhausted — falling back to Bytez API`);

    // Try each model with generous timeout for cold starts
    for (const bModel of BYTEZ_MODELS) {
      // Wait between attempts to respect 1-req-at-a-time limit
      await new Promise(r => setTimeout(r, 2000));

      try {
        console.log(`⏳ Trying Bytez: ${bModel}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000); // 120s for cold start

        const response = await fetch(`https://api.bytez.com/models/v2/${bModel}`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "Authorization": bytezKey,
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemMsg },
              { role: "user", content: prompt },
            ],
          }),
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          const content = data.output?.content || data.output || data.choices?.[0]?.message?.content;
          if (content && typeof content === "string" && content.length > 20) {
            console.log(`✅ Success with Bytez: ${bModel}`);
            return content;
          }
          console.warn(`⚠️  Bytez ${bModel} returned empty/short content`);
        } else {
          const errBody = await response.text();
          console.warn(`⚠️  Bytez ${bModel} failed (${response.status}): ${errBody.slice(0, 150)}`);
          // If rate limited, wait longer before trying next model
          if (response.status === 429) {
            console.log(`⏸️  Bytez rate limited — waiting 6s...`);
            await new Promise(r => setTimeout(r, 6000));
          }
        }
      } catch (err) {
        console.warn(`⚠️  Bytez ${bModel} threw exception: ${err.message}`);
      }
    }
  }

  return null;
}

// ── Extract JSON array from LLM response ─────────────────────
function extractJsonArray(raw) {
  // Try direct parse first
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  // Try extracting from markdown code block
  const codeBlock = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlock) {
    try {
      const parsed = JSON.parse(codeBlock[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  // Try finding array brackets
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  // ── Truncation repair: if output was cut off mid-JSON, rescue complete objects ──
  if (start !== -1) {
    let slice = raw.slice(start);
    // Find the last complete object by looking for the last "}," or "}" before truncation
    const lastCompleteObj = slice.lastIndexOf("}");
    if (lastCompleteObj > 0) {
      let repaired = slice.slice(0, lastCompleteObj + 1);
      // Close the array
      if (!repaired.trim().endsWith("]")) repaired = repaired.trim() + "]";
      // Remove any trailing comma before the ]
      repaired = repaired.replace(/,\s*\]$/, "]");
      try {
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`🔧 Repaired truncated JSON: rescued ${parsed.length} items`);
          return parsed;
        }
      } catch {}
    }
  }

  return null;
}

// ── API route: generate notes ────────────────────────────────
app.post("/api/generate-notes", async (req, res) => {
  try {
    const { classNum, subject, chapter, topic } = req.body;

    if (!classNum || !subject || !chapter || !chapter.trim()) {
      return res.status(400).json({ error: "Class, subject, and chapter name are all required." });
    }
    if (!SUBJECTS_BY_CLASS[classNum]) {
      return res.status(400).json({ error: "Invalid class selected." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration: missing API key." });
    }

    if (topic) console.log(`📌 Topic focus: "${topic}" within ${chapter}`);

    const systemMsg = "You are an expert CBSE teacher. Generate well-structured, exam-focused study notes appropriate for the student's class level. Use markdown formatting with headings (##), bullet points, and bold for emphasis.";
    const prompt = buildNotesPrompt(classNum, subject, chapter.trim(), topic || "");
    const notes = await callOpenRouter(apiKey, systemMsg, prompt);

    if (!notes) {
      return res.status(502).json({ error: "All AI models are temporarily busy. Please try again in a minute." });
    }

    return res.json({ notes });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

// ── API route: generate flashcards ───────────────────────────
app.post("/api/generate-flashcards", async (req, res) => {
  try {
    const { classNum, subject, chapter } = req.body;

    if (!classNum || !subject || !chapter || !chapter.trim()) {
      return res.status(400).json({ error: "Class, subject, and chapter name are all required." });
    }
    if (!SUBJECTS_BY_CLASS[classNum]) {
      return res.status(400).json({ error: "Invalid class selected." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration: missing API key." });
    }

    const systemMsg = "You are a CBSE exam expert. Generate flashcards as a valid JSON array. Output ONLY the JSON array, no other text.";
    const prompt = buildFlashcardPrompt(classNum, subject, chapter.trim());
    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 3000);

    if (!raw) {
      return res.status(502).json({ error: "All AI models are temporarily busy. Please try again in a minute." });
    }

    const flashcards = extractJsonArray(raw);
    if (!flashcards || flashcards.length === 0) {
      console.error("Failed to parse flashcards from:", raw.slice(0, 300));
      return res.status(502).json({ error: "Failed to generate flashcards. Please try again." });
    }

    // Validate and clean each card
    const cleaned = flashcards
      .filter((c) => c && c.question && c.answer)
      .map((c) => ({
        type: ["definition", "formula", "concept"].includes(c.type) ? c.type : "concept",
        question: String(c.question).trim(),
        answer: String(c.answer).trim(),
      }));

    if (cleaned.length === 0) {
      return res.status(502).json({ error: "Generated flashcards were invalid. Please try again." });
    }

    console.log(`📇 Generated ${cleaned.length} flashcards`);
    return res.json({ flashcards: cleaned });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

// ── API route: generate questions ────────────────────────────
app.post("/api/generate-questions", async (req, res) => {
  try {
    const { classNum, subject, chapter } = req.body;

    if (!classNum || !subject || !chapter || !chapter.trim()) {
      return res.status(400).json({ error: "Class, subject, and chapter name are all required." });
    }
    if (!SUBJECTS_BY_CLASS[classNum]) {
      return res.status(400).json({ error: "Invalid class selected." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration: missing API key." });
    }

    const systemMsg = "You are a CBSE exam paper setter. Generate exam-style questions as a valid JSON array. Output ONLY the JSON array, no other text.";
    const prompt = buildQuestionPrompt(classNum, subject, chapter.trim());
    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 8000);

    if (!raw) {
      return res.status(502).json({ error: "All AI models are temporarily busy. Please try again in a minute." });
    }

    const questions = extractJsonArray(raw);
    if (!questions || questions.length === 0) {
      console.error("Failed to parse questions from:", raw.slice(0, 300));
      return res.status(502).json({ error: "Failed to generate questions. Please try again." });
    }

    const cleaned = questions
      .filter((q) => q && q.question && q.final_answer)
      .map((q) => ({
        type: ["mcq", "short", "long", "case", "assertion"].includes(q.type) ? q.type : "short",
        difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium",
        question: String(q.question).trim(),
        solution_steps: Array.isArray(q.solution_steps) ? q.solution_steps.map(String) : [String(q.solution_steps || "")],
        final_answer: String(q.final_answer).trim(),
        marks_tip: String(q.marks_tip || "").trim(),
      }));

    if (cleaned.length === 0) {
      return res.status(502).json({ error: "Generated questions were invalid. Please try again." });
    }

    console.log(`📝 Generated ${cleaned.length} practice questions`);
    return res.json({ questions: cleaned });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

// ── API route: generate test ─────────────────────────────────
app.post("/api/generate-test", async (req, res) => {
  try {
    const { classNum, subject, chapter } = req.body;

    if (!classNum || !subject || !chapter || !chapter.trim()) {
      return res.status(400).json({ error: "Class, subject, and chapter name are all required." });
    }
    if (!SUBJECTS_BY_CLASS[classNum]) {
      return res.status(400).json({ error: "Invalid class selected." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration: missing API key." });
    }

    const systemMsg = "You are a CBSE exam paper setter. Generate a test as a valid JSON array. Output ONLY the JSON array, no other text.";
    const prompt = buildTestPrompt(classNum, subject, chapter.trim());
    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 8000);

    if (!raw) {
      return res.status(502).json({ error: "All AI models are temporarily busy. Please try again in a minute." });
    }

    const questions = extractJsonArray(raw);
    if (!questions || questions.length === 0) {
      console.error("Failed to parse test from:", raw.slice(0, 300));
      return res.status(502).json({ error: "Failed to generate test. Please try again." });
    }

    const cleaned = questions
      .filter((q) => q && q.question && q.answer)
      .map((q) => ({
        type: ["mcq", "short", "long", "case"].includes(q.type) ? q.type : "short",
        question: String(q.question).trim(),
        answer: String(q.answer).trim(),
        marks: Number(q.marks) || 2,
        key_points: Array.isArray(q.key_points) ? q.key_points.map(String) : [],
      }));

    if (cleaned.length === 0) {
      return res.status(502).json({ error: "Generated test was invalid. Please try again." });
    }

    const totalMarks = cleaned.reduce((sum, q) => sum + q.marks, 0);
    console.log(`📝 Generated test: ${cleaned.length} questions, ${totalMarks} marks`);
    return res.json({ questions: cleaned, totalMarks });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

// ── API route: evaluate test ─────────────────────────────────
app.post("/api/evaluate-test", async (req, res) => {
  try {
    const { classNum, questions, userAnswers } = req.body;

    if (!questions || !userAnswers || questions.length !== userAnswers.length) {
      return res.status(400).json({ error: "Invalid test submission." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration: missing API key." });
    }

    // ── Pre-score empty / trivially short answers ──
    // Only send meaningful answers to AI for evaluation
    const preScored = [];  // final results array
    const toEvaluate = []; // { originalIndex, question, userAnswer }

    questions.forEach((q, i) => {
      const answer = (userAnswers[i] || "").trim();
      const minLength = q.type === "mcq" ? 1 : 8; // MCQ needs at least 1 char, others need 8+

      if (answer.length < minLength) {
        // Auto-score: 0 marks for skipped / empty answers
        preScored[i] = {
          marks_awarded: 0,
          total_marks: q.marks,
          feedback: answer.length === 0 ? "No answer provided." : "Answer too short to evaluate.",
          improvement_tip: "Attempt the question fully. Even partial answers can earn marks.",
        };
      } else {
        preScored[i] = null; // will be filled by AI
        toEvaluate.push({ originalIndex: i, question: q, userAnswer: answer });
      }
    });

    // ── If ALL answers are empty, return immediately ──
    if (toEvaluate.length === 0) {
      const totalMax = questions.reduce((s, q) => s + q.marks, 0);
      console.log(`✅ Evaluated test: 0/${totalMax} (all empty)`);
      return res.json({ results: preScored, totalAwarded: 0, totalMax });
    }

    // ── Build evaluation context for non-empty answers only ──
    const qaText = toEvaluate.map((item, idx) => {
      const q = item.question;
      return `Question ${idx + 1} (${q.marks} marks, type: ${q.type}):
${q.question}

Correct Answer: ${q.answer}
Key Points: ${(q.key_points || []).join(", ")}

Student's Answer: ${item.userAnswer}`;
    }).join("\n\n---\n\n");

    const systemMsg = "You are a strict CBSE exam evaluator. Grade answers HONESTLY. If an answer is wrong, incomplete, or off-topic, give 0 or low marks. Do NOT be generous. Output ONLY a valid JSON array, no other text.";
    const prompt = `Evaluate a CBSE Class ${classNum || "10"} student's test answers STRICTLY.

Here are the questions, correct answers, and student's answers:

${qaText}

STRICT RULES:
- If student's answer is WRONG or completely off-topic: give 0 marks
- If answer is partially correct: give proportional partial marks
- If answer is correct but incomplete: deduct marks for missing key points
- NEVER give full marks unless ALL key points are covered
- Be FAIR but STRICT, like a real CBSE examiner

Format strictly as a JSON array (no other text, no markdown, just the JSON):

[
  {
    "marks_awarded": 0,
    "total_marks": 3,
    "feedback": "Brief feedback on what was right/wrong",
    "improvement_tip": "Specific tip to improve"
  }
]

Be honest. Wrong answers = 0 marks. Partial = partial marks.`;

    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 3000);

    let useKeywordFallback = false;

    if (!raw) {
      useKeywordFallback = true;
    }

    let aiResults = null;
    if (!useKeywordFallback) {
      aiResults = extractJsonArray(raw);
      // Validate that results are proper objects with marks_awarded
      if (!aiResults || aiResults.length === 0 || typeof aiResults[0] !== "object" || !("marks_awarded" in aiResults[0])) {
        console.log("⚠️ AI returned bad evaluation data, falling back to keyword scoring");
        useKeywordFallback = true;
      }
    }

    if (useKeywordFallback) {
      // ── Keyword-match fallback scoring ──
      toEvaluate.forEach((item) => {
        const q = item.question;
        const studentLower = item.userAnswer.toLowerCase();
        const correctLower = q.answer.toLowerCase();

        // Check key points coverage
        let matched = 0;
        const kp_arr = q.key_points || [];
        const totalPoints = kp_arr.length || 1;
        kp_arr.forEach(kp => {
          if (studentLower.includes(kp.toLowerCase())) matched++;
        });

        // Also check if correct answer keywords appear
        const correctWords = correctLower.split(/\s+/).filter(w => w.length > 3);
        let wordMatches = 0;
        correctWords.forEach(w => { if (studentLower.includes(w)) wordMatches++; });
        const wordCoverage = correctWords.length > 0 ? wordMatches / correctWords.length : 0;

        // Combine: key_points coverage (60%) + word similarity (40%)
        const keyPtScore = totalPoints > 0 ? matched / totalPoints : 0;
        const combinedScore = (keyPtScore * 0.6) + (wordCoverage * 0.4);
        const marks = Math.round(combinedScore * q.marks);

        preScored[item.originalIndex] = {
          marks_awarded: marks,
          total_marks: q.marks,
          feedback: marks === 0
            ? "Answer does not match expected response."
            : `Partially correct. ${matched}/${totalPoints} key points covered.`,
          improvement_tip: "Review the correct answer and ensure all key points are included.",
        };
      });
    } else {
      // ── Merge AI results into pre-scored array ──
      toEvaluate.forEach((item, aiIdx) => {
        const r = aiResults[aiIdx] || {};
        const maxMarks = item.question.marks;
        preScored[item.originalIndex] = {
          marks_awarded: Math.min(Math.max(Number(r.marks_awarded) || 0, 0), maxMarks),
          total_marks: maxMarks,
          feedback: String(r.feedback || "Evaluated by AI.").trim(),
          improvement_tip: String(r.improvement_tip || "").trim(),
        };
      });
    }

    // ── Fill any gaps (safety) ──
    const finalResults = preScored.map((r, i) => r || {
      marks_awarded: 0,
      total_marks: questions[i].marks,
      feedback: "Could not evaluate this answer.",
      improvement_tip: "",
    });

    const totalAwarded = finalResults.reduce((s, r) => s + r.marks_awarded, 0);
    const totalMax = finalResults.reduce((s, r) => s + r.total_marks, 0);
    console.log(`✅ Evaluated test: ${totalAwarded}/${totalMax}${useKeywordFallback ? " (keyword fallback)" : ""}`);
    return res.json({ results: finalResults, totalAwarded, totalMax });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

// ── API route: generate arena ────────────────────────────────
app.post("/api/generate-arena", async (req, res) => {
  try {
    const { classNum, subject, chapter } = req.body;

    if (!classNum || !subject || !chapter || !chapter.trim()) {
      return res.status(400).json({ error: "Class, subject, and chapter name are required." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration: missing API key." });
    }

    const systemMsg = "You are a CBSE exam high-performance coach. Generate 10 rapid-fire decision questions as a valid JSON array. Output ONLY the JSON array, no other text.";
    const prompt = buildArenaPrompt(classNum, subject, chapter.trim());
    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 4000);

    if (!raw) {
      return res.status(502).json({ error: "All AI models are temporarily busy. Please try again in a minute." });
    }

    const questions = extractJsonArray(raw);
    if (!questions || questions.length === 0) {
      console.error("Failed to parse arena questions from:", raw.slice(0, 300));
      return res.status(502).json({ error: "Failed to generate arena questions. Please try again." });
    }

    const cleaned = questions
      .filter((q) => q && q.question && q.answer)
      .map((q) => ({
        type: ["concept_recognition", "method_selection", "quick_mcq", "error_spotting"].includes(q.type) ? q.type : "quick_mcq",
        difficulty: ["easy", "medium", "hard", "boss"].includes(q.difficulty) ? q.difficulty : "medium",
        question: String(q.question).trim(),
        options: Array.isArray(q.options) ? q.options.map(String) : [],
        answer: String(q.answer).trim(),
        insightRefinement: String(q.insightRefinement || "Focus on the core principle.").trim(),
      }));

    if (cleaned.length === 0) {
      return res.status(502).json({ error: "Generated questions were invalid. Please try again." });
    }

    console.log(`⚔️ Generated ${cleaned.length} Arena questions`);
    return res.json({ questions: cleaned });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

// ── API route: analyze performance ───────────────────────────
app.post("/api/analyze-performance", async (req, res) => {
  try {
    const { classNum, chapter, flashcardPct, practicePct, testPct } = req.body;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration: missing API key." });
    }

    const systemMsg = "You are a CBSE study coach. Analyze performance and give advice as valid JSON. Output ONLY the JSON object, no other text.";
    const prompt = `Analyze a CBSE Class ${classNum || 10} student's performance for chapter "${chapter || 'Unknown'}".

Data:
- Flashcard accuracy: ${flashcardPct ?? 'N/A'}%
- Practice attempt rate: ${practicePct ?? 'N/A'}%
- Test score: ${testPct ?? 'N/A'}%

Format strictly as a JSON object (no other text, no markdown):

{
  "level": "Strong/Moderate/Weak",
  "issue": "Memory/Concept/Application/None",
  "reason": "Brief reason",
  "action_plan": ["Action 1", "Action 2", "Action 3"]
}

Keep it short, actionable, and exam-focused.`;

    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 500);

    if (!raw) {
      return res.status(502).json({ error: "AI temporarily busy." });
    }

    // Try to parse JSON object
    let analysis;
    try { analysis = JSON.parse(raw); } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) { try { analysis = JSON.parse(match[0]); } catch {} }
    }

    if (!analysis) {
      return res.status(502).json({ error: "Failed to parse analysis." });
    }

    return res.json({ analysis });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ── API route: generate retry questions ──────────────────────
app.post("/api/generate-retry-questions", async (req, res) => {
  try {
    const { classNum, subject, chapter, weakTopics } = req.body;

    if (!classNum || !subject || !chapter) {
      return res.status(400).json({ error: "Class, subject, and chapter are required." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration: missing API key." });
    }

    const topicsText = (weakTopics && weakTopics.length > 0)
      ? `Focus specifically on these weak areas:\n${weakTopics.map(t => `- ${t}`).join("\n")}`
      : "Focus on the most commonly mistaken concepts.";

    const systemMsg = "You are a CBSE exam expert. Generate retry practice questions as a valid JSON array. Output ONLY the JSON array, no other text.";
    const prompt = `Generate 3 CBSE Class ${classNum} retry questions for chapter: "${chapter}" in subject: "${subject}".

${topicsText}

Rules:
- Questions should target the exact weak concepts
- Mix of difficulty levels
- Include step-by-step solution for learning
- Exam-quality questions

Format strictly as a JSON array:

[
  {
    "question": "Question text",
    "solution_steps": ["Step 1", "Step 2"],
    "final_answer": "Correct answer"
  }
]`;

    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 2000);

    if (!raw) {
      return res.status(502).json({ error: "AI temporarily busy." });
    }

    const questions = extractJsonArray(raw);
    if (!questions || questions.length === 0) {
      return res.status(502).json({ error: "Failed to generate retry questions." });
    }

    const cleaned = questions
      .filter(q => q && q.question && q.final_answer)
      .map(q => ({
        question: String(q.question).trim(),
        solution_steps: Array.isArray(q.solution_steps) ? q.solution_steps.map(String) : [String(q.solution_steps || "")],
        final_answer: String(q.final_answer).trim(),
      }));

    console.log(`🔄 Generated ${cleaned.length} retry questions`);
    return res.json({ questions: cleaned });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ── API route: solve doubt ───────────────────────────────────
app.post("/api/solve-doubt", async (req, res) => {
  try {
    const { classNum, subject, chapter, question, contextStep, followUp } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Please type your question." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration: missing API key." });
    }

    let focusHint = "";
    if (contextStep === "practice" || contextStep === "test") focusHint = "Focus on solving method and exam approach.";
    else if (contextStep === "flashcards") focusHint = "Focus on definitions, formulas, and quick recall.";
    else if (contextStep === "correction") focusHint = "Focus on why the mistake happened and how to fix it.";
    else focusHint = "Focus on concept clarity and understanding.";

    const moreDetail = followUp ? "\n\nThe student is still confused. Give a MORE DETAILED explanation with a DIFFERENT EXAMPLE. Be extra simple." : "";

    const systemMsg = "You are a friendly CBSE teacher. Explain doubts clearly and concisely. Keep responses exam-focused and structured.";
    const prompt = `You are helping a CBSE Class ${classNum || 10} student.

Subject: ${subject || "General"}
Chapter: ${chapter || "General"}

Student's doubt:
"${question.trim()}"

${focusHint}${moreDetail}

Instructions:
- Explain in simple, clear language appropriate for Class ${classNum || 10}
- Keep it exam-focused (CBSE style)
- Use step-by-step explanation if needed
- Include a short example if helpful
- Highlight the key concept

Format your response as:

📌 EXPLANATION:
[Clear explanation]

📊 STEPS (if applicable):
[Step-by-step breakdown]

🧠 KEY CONCEPT:
[One line summary to remember]

🎯 EXAM TIP:
[Practical tip for the exam]

Keep it SHORT and structured. Skip any section that isn't relevant.`;

    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 1500);

    if (!raw) {
      return res.status(502).json({ error: "AI temporarily busy. Try again." });
    }

    console.log(`💡 Doubt solved for Class ${classNum} ${subject}`);
    return res.json({ answer: raw.trim() });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ── API route: get video help ────────────────────────────────
app.post("/api/get-video-help", async (req, res) => {
  try {
    const { classNum, subject, chapter, topic } = req.body;

    if (!subject || !chapter) {
      return res.status(400).json({ error: "Subject and chapter are required." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration." });
    }

    const topicText = topic ? `specifically about "${topic}"` : "";
    const searchBase = `CBSE Class ${classNum || 10} ${subject} ${chapter}`;

    const systemMsg = "You are a CBSE study helper. Recommend the BEST YouTube videos from REPUTABLE Indian educational channels ONLY. Output ONLY valid JSON array, no other text.";
    const prompt = `Suggest exactly 2 YouTube video search queries for a CBSE Class ${classNum || 10} student studying ${subject}, chapter "${chapter}" ${topicText}.

CRITICAL RULES:
- ONLY recommend from these TOP reputable channels:
  * Physics Wallah (PW)
  * Unacademy
  * Vedantu
  * Khan Academy India
  * Magnet Brains
  * Dear Sir
  * Science and Fun Education
  * Shobhit Nirwan
  * Hashtag Study
  * BYJU'S
  * Apni Kaksha

- Search queries MUST include: "CBSE Class ${classNum || 10}" + "${subject}" + "${chapter}"
- Each query should target a SPECIFIC reputable channel
- Focus on SHORT (8-20 min) chapter explanations, NOT full lectures
- Include the channel name in the search query for accuracy

Format strictly as JSON array:

[
  {
    "title": "Short descriptive title",
    "search_query": "CBSE Class ${classNum || 10} ${subject} ${chapter} [channel name] explanation",
    "channel_hint": "Exact channel name",
    "duration_hint": "~10 min",
    "focus": "concept/formula/solving"
  }
]`;

    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 800);
    let videos = [];

    if (raw) {
      const parsed = extractJsonArray(raw);
      if (parsed && parsed.length > 0) {
        videos = parsed.slice(0, 2).map(v => {
          let q = String(v.search_query || `${searchBase} explanation`).trim();
          // Ensure CBSE class info is in query
          if (!q.toLowerCase().includes("cbse") && !q.toLowerCase().includes("class")) {
            q = `CBSE Class ${classNum || 10} ${q}`;
          }
          const encodedQ = encodeURIComponent(q);
          return {
            title: String(v.title || `${chapter} Explanation`).trim(),
            search_query: q,
            url: `https://www.youtube.com/results?search_query=${encodedQ}`,
            thumbnail: `https://img.youtube.com/vi/default/hqdefault.jpg`,
            duration_hint: String(v.duration_hint || "~10 min").trim(),
            channel_hint: String(v.channel_hint || "Physics Wallah").trim(),
            focus: String(v.focus || "concept").trim(),
          };
        });
      }
    }

    // Fallback: target reputable channels specifically
    if (videos.length === 0) {
      const q1 = `CBSE Class ${classNum || 10} ${subject} ${chapter} Physics Wallah explanation`;
      const q2 = `CBSE Class ${classNum || 10} ${subject} ${chapter} ${topic || ""} Vedantu one shot`;
      videos = [
        {
          title: `${chapter} — Physics Wallah Explanation`,
          search_query: q1,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q1)}`,
          thumbnail: `https://img.youtube.com/vi/default/hqdefault.jpg`,
          duration_hint: "~15 min",
          channel_hint: "Physics Wallah",
          focus: "concept",
        },
        {
          title: `${chapter} — Vedantu One Shot`,
          search_query: q2,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q2)}`,
          thumbnail: `https://img.youtube.com/vi/default/hqdefault.jpg`,
          duration_hint: "~20 min",
          channel_hint: "Vedantu",
          focus: "revision",
        },
      ];
    }

    console.log(`🎬 Generated ${videos.length} video suggestions`);
    return res.json({ videos });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ── API route: generate mind map ─────────────────────────────
app.post("/api/generate-mindmap", async (req, res) => {
  try {
    const { classNum, subject, chapter } = req.body;

    if (!subject || !chapter) {
      return res.status(400).json({ error: "Subject and chapter are required." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration." });
    }

    const systemMsg = "You are a CBSE exam expert. Generate mind maps as valid JSON. Output ONLY the JSON object, no other text.";
    const prompt = `Generate a CBSE Class ${classNum || 10} mind map for the chapter: "${chapter}" in subject: "${subject}".

Rules:
- Keep it simple and visual
- Maximum 6–8 main nodes
- Each node should have 2–4 subpoints
- No long sentences (use short phrases only)
- Focus on exam-relevant concepts
- Cover all important topics for board exams

Format strictly as a JSON object (no markdown, no extra text):

{
  "title": "${chapter}",
  "nodes": [
    {
      "topic": "Main Topic Name",
      "subtopics": ["Point 1", "Point 2", "Point 3"]
    }
  ]
}`;

    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 1500);

    if (!raw) {
      return res.status(502).json({ error: "AI temporarily busy." });
    }

    // Parse JSON object
    let mindmap;
    try { mindmap = JSON.parse(raw); } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) { try { mindmap = JSON.parse(match[0]); } catch {} }
    }

    if (!mindmap || !mindmap.nodes || !Array.isArray(mindmap.nodes)) {
      console.error("Failed to parse mindmap from:", raw.slice(0, 300));
      return res.status(502).json({ error: "Failed to generate mind map. Try again." });
    }

    // Clean nodes
    mindmap.title = String(mindmap.title || chapter).trim();
    mindmap.nodes = mindmap.nodes
      .filter(n => n && n.topic)
      .slice(0, 10)
      .map(n => ({
        topic: String(n.topic).trim(),
        subtopics: Array.isArray(n.subtopics) ? n.subtopics.map(String).slice(0, 5) : [],
      }));

    console.log(`🗺️ Generated mind map: ${mindmap.nodes.length} nodes`);
    return res.json({ mindmap });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ── API route: generate audiobook (AI script + Bytez bark TTS) ─
app.post("/api/generate-audio-script", async (req, res) => {
  try {
    const { classNum, subject, chapter, summaryText } = req.body;

    if (!chapter || !summaryText) {
      return res.status(400).json({ error: "Chapter and summary text are required." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server misconfiguration." });

    // ── Generate a clean, natural narration script via AI ──
    const systemMsg = "You are a friendly, engaging CBSE teacher narrating a lesson. Output ONLY the spoken script — plain conversational sentences. No markdown, no bullet points, no headings, no special characters.";
    const prompt = `Convert the following study notes into a natural spoken narration script for a Class ${classNum || 10} ${subject || "Science"} student.

Chapter: "${chapter}"

Rules:
- Write ONLY what would be spoken aloud — plain sentences only
- Speak directly to the student: use "you" and "we"
- Use transitions: "Now let's look at...", "The important thing here is...", "Remember that..."
- Keep it to 300-450 words (about 3 minutes spoken at normal pace)
- Emphasize exam points naturally: "This is very important for your exam..."
- Use comma placement for natural breathing rhythm
- End with: "Good luck with your exam. You've got this."

Notes:
${summaryText.slice(0, 4000)}

Output ONLY the spoken script. Nothing else.`;

    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 2000);

    // Clean any residual markdown
    const cleanScript = (text) => text
      .replace(/#{1,6}\s*/g, "")
      .replace(/\*\*/g, "").replace(/\*/g, "")
      .replace(/[-•]\s+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!raw) {
      // Fallback: clean up the notes text itself for TTS
      const fallback = cleanScript(summaryText);
      return res.json({ script: fallback, wordCount: fallback.split(/\s+/).length, type: "text-only" });
    }

    const script = cleanScript(raw);
    const wordCount = script.split(/\s+/).length;
    console.log(`🎧 Audiobook script ready: ~${wordCount} words`);

    return res.json({
      script,
      wordCount,
      estimatedMinutes: Math.ceil(wordCount / 140),
      type: "text-only",
    });
  } catch (err) {
    console.error("Audiobook error:", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ── API route: generate memory song (Bytez suno/bark — free) ─
const AUDIO_DIR = path.join(__dirname, "public", "audio");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

app.post("/api/generate-music", async (req, res) => {
  try {
    const { classNum, subject, chapter, keyPoints, performanceLevel } = req.body;

    if (!chapter) {
      return res.status(400).json({ error: "Chapter is required." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server misconfiguration." });

    const bytezKey = process.env.BYTEZ_API_KEY;
    if (!bytezKey) return res.status(500).json({ error: "Bytez API key not configured." });

    // ── Step 1: Generate lyrics via OpenRouter ──
    const level = performanceLevel || "medium";
    const mood = level === "high" ? "celebratory, upbeat, victorious" :
                 level === "low"  ? "motivational, encouraging, comeback" :
                                    "focused, steady, educational";

    const points = keyPoints || chapter;
    const systemMsg = "You are a creative songwriter who writes catchy educational songs. Output ONLY the song lyrics, nothing else.";
    const lyricsPrompt = `Create a short educational song for a CBSE Class ${classNum || 10} student.

Subject: ${subject || "General"}
Chapter: ${chapter}

Key points to cover:
${typeof points === "string" ? points : JSON.stringify(points)}

Requirements:
- Keep it VERY short (4-6 lines maximum, under 50 words total)
- Make it extremely catchy and easy to remember
- Include important formulas, definitions, or concepts
- Use simple language a student would enjoy
- The mood should be: ${mood}
- Make it rhythmic and fun to sing along
- Wrap each line in ♪ symbols for singing

Example format:
♪ Atoms have protons in the core ♪
♪ Electrons orbit, wanting more ♪

Output song lyrics only. No titles, no instructions, no brackets. Keep it under 50 words.`;

    const lyrics = await callOpenRouter(apiKey, systemMsg, lyricsPrompt, 500);
    if (!lyrics) {
      return res.status(502).json({ error: "Failed to generate lyrics." });
    }

    const cleanLyrics = lyrics
      .replace(/\*\*/g, "").replace(/\*/g, "")
      .replace(/#/g, "").replace(/\[.*?\]/g, "")
      .trim();

    console.log(`🎵 Generated lyrics: ${cleanLyrics.split(/\s+/).length} words`);

    // ── Step 2: Style label ──
    const styleLabel = level === "high" ? "Victory Anthem" :
                       level === "low"  ? "Comeback Track" :
                                          "Study Groove";
    const styleTags = level === "high"
      ? ["pop", "upbeat", "energetic", "happy"]
      : level === "low"
      ? ["acoustic", "inspiring", "warm", "motivational"]
      : ["pop", "chill", "educational", "medium tempo"];

    // ── Step 3: Format for Bark singing ──
    // Bark uses ♪ to indicate singing and [laughs] etc for expressions
    let barkPrompt = cleanLyrics;
    // Ensure lyrics have ♪ notation for singing
    if (!barkPrompt.includes("♪")) {
      barkPrompt = barkPrompt.split("\n").filter(l => l.trim())
        .map(line => `♪ ${line.trim()} ♪`)
        .join("\n");
    }

    console.log(`🎤 Sending to Bark for singing: ${barkPrompt.slice(0, 80)}...`);

    // ── Step 4: Generate audio via Bytez suno/bark ──
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000); // 3 min timeout

    const barkRes = await fetch("https://api.bytez.com/models/v2/suno/bark", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": bytezKey,
      },
      body: JSON.stringify({ text: barkPrompt }),
    });

    clearTimeout(timeout);

    if (!barkRes.ok) {
      const errText = await barkRes.text();
      console.warn(`⚠️ Bark failed (${barkRes.status}): ${errText.slice(0, 200)}`);
      return res.status(502).json({ error: "Song generation failed. Please try again." });
    }

    const barkData = await barkRes.json();
    
    if (barkData.error) {
      console.warn(`⚠️ Bark error: ${barkData.error}`);
      return res.status(502).json({ error: "Song generation failed: " + barkData.error });
    }

    const audioBase64 = barkData.output;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      console.warn("⚠️ Bark: no audio output");
      return res.status(502).json({ error: "No audio generated." });
    }

    // ── Step 5: Save WAV to public/audio/ ──
    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const filename = `song_${sessionId}.wav`;
    const filePath = path.join(AUDIO_DIR, filename);

    const audioBuffer = Buffer.from(audioBase64, "base64");
    fs.writeFileSync(filePath, audioBuffer);
    
    console.log(`✅ Memory song saved: ${filename} (${Math.round(audioBuffer.length / 1024)}KB)`);

    // ── Step 6: Clean up old songs (keep last 20) ──
    try {
      const allSongs = fs.readdirSync(AUDIO_DIR).filter(f => f.startsWith("song_"));
      if (allSongs.length > 20) {
        const sorted = allSongs.sort();
        const toDelete = sorted.slice(0, sorted.length - 20);
        toDelete.forEach(f => fs.unlinkSync(path.join(AUDIO_DIR, f)));
      }
    } catch {}

    return res.json({
      audio_url: `/audio/${filename}`,
      lyrics: cleanLyrics,
      style: styleLabel,
      tags: styleTags,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("⚠️ Bark song generation timed out");
      return res.status(504).json({ error: "Song generation timed out." });
    }
    console.error("Music generation error:", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ── API route: generate AI video (Bytez — Multi-Clip) ────────
// (fs, pipeline, Readable imported at top)

// Ensure videos directory exists
const VIDEOS_DIR = path.join(__dirname, "public", "videos");
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

app.post("/api/generate-video", async (req, res) => {
  try {
    const { classNum, subject, chapter } = req.body;

    if (!chapter) {
      return res.status(400).json({ error: "Chapter is required." });
    }

    const bytezKey = process.env.BYTEZ_API_KEY;
    if (!bytezKey) {
      return res.status(500).json({ error: "Bytez API key not configured.", fallback: "youtube" });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenRouter API key not configured.", fallback: "youtube" });
    }

    // ── Step 1: Generate scene descriptions using AI ──
    console.log(`🎬 Step 1: Generating scene descriptions for "${chapter}"...`);

    const sceneSystemMsg = "You are an educational video director. Generate short, visual scene descriptions for an AI video generator. Output ONLY a valid JSON array, no other text.";
    const scenePrompt = `Create 4 short visual scene descriptions for an educational video about CBSE Class ${classNum || 10} ${subject || ""} chapter: "${chapter}".

Each scene should visually explain a KEY CONCEPT from the chapter.

Rules:
- Each scene description must be 1 sentence, max 15 words
- Describe ONLY visual elements (what is shown on screen)
- Use simple, concrete imagery (diagrams, objects, animations)
- Avoid abstract concepts — make them visual
- Focus on the most important exam concepts
- Each scene should cover a DIFFERENT concept

Format as JSON array of strings:
["Scene 1 description", "Scene 2 description", "Scene 3 description", "Scene 4 description"]`;

    const sceneRaw = await callOpenRouter(apiKey, sceneSystemMsg, scenePrompt, 500);
    
    let scenes = [];
    if (sceneRaw) {
      try {
        const parsed = JSON.parse(sceneRaw);
        if (Array.isArray(parsed)) scenes = parsed.slice(0, 5).map(String);
      } catch {
        const arr = extractJsonArray(sceneRaw);
        if (arr) scenes = arr.slice(0, 5).map(String);
      }
    }

    // Fallback scenes if AI fails
    if (scenes.length === 0) {
      scenes = [
        `Educational diagram illustrating key concepts of ${chapter}`,
        `Animated visualization of formulas and definitions for ${chapter}`,
        `Colorful flowchart showing the process described in ${chapter}`,
        `Summary infographic with important points from ${chapter}`,
      ];
    }

    console.log(`📝 Generated ${scenes.length} scene descriptions`);

    // ── Step 2: Generate video clips in parallel via Bytez ──
    console.log(`🎬 Step 2: Generating ${scenes.length} video clips via Bytez (Wan-2.1)...`);

    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    
    const clipPromises = scenes.map(async (scene, idx) => {
      try {
        console.log(`  🎥 Clip ${idx + 1}: "${scene.slice(0, 50)}..."`);
        
        // Try state-of-the-art Wan-2.1 first, zeroscope as backup
        const VIDEO_MODELS = [
          "Wan-AI/Wan2.1-T2V-1.3B",
          "cerspense/zeroscope_v2_576w",
        ];

        let data = null;
        for (const model of VIDEO_MODELS) {
          try {
            const controller = new AbortController();
            // Wan-2.1 is heavy, give it a massive 8 minute timeout
            const timeout = setTimeout(() => controller.abort(), 480000);

            const response = await fetch(`https://api.bytez.com/models/v2/${model}`, {
              method: "POST",
              signal: controller.signal,
              headers: {
                "Content-Type": "application/json",
                "Authorization": bytezKey,
              },
              body: JSON.stringify({ text: scene }),
            });

            clearTimeout(timeout);

            if (!response.ok) {
              console.warn(`  ⚠️ Clip ${idx + 1} failed with ${model} (${response.status})`);
              continue; // try next model
            }

            data = await response.json();
            const videoUrl = data.output || data.output_url || data.url;
            
            if (videoUrl) {
              console.log(`  ✅ Clip ${idx + 1} generated via ${model.split("/")[0]}`);

              // Download the clip to public/videos/
              const filename = `clip_${sessionId}_${idx}.mp4`;
              const filePath = path.join(VIDEOS_DIR, filename);
              
              const dlRes = await fetch(videoUrl);
              if (!dlRes.ok) {
                console.warn(`  ⚠️ Clip ${idx + 1}: download failed`);
                continue;
              }

              const fileStream = fs.createWriteStream(filePath);
              await pipeline(Readable.fromWeb(dlRes.body), fileStream);

              console.log(`  💾 Clip ${idx + 1} saved: ${filename}`);
              return {
                url: `/videos/${filename}`,
                scene: scene,
                index: idx,
              };
            }
          } catch (modelErr) {
            console.warn(`  ⚠️ Clip ${idx + 1} failed with ${model}: ${modelErr.message}`);
            continue;
          }
        }
        // All models failed for this clip
        console.warn(`  ❌ Clip ${idx + 1}: all models failed`);
        return null;
      } catch (err) {
        console.warn(`  ⚠️ Clip ${idx + 1} error: ${err.message}`);
        return null;
      }
    });

    const clipResults = await Promise.all(clipPromises);
    const clips = clipResults.filter(Boolean).sort((a, b) => a.index - b.index);

    if (clips.length === 0) {
      console.warn("⚠️ All clips failed, falling back to YouTube");
      return res.status(502).json({ 
        error: "Video generation failed for all scenes.", 
        fallback: "youtube" 
      });
    }

    console.log(`🎬 Successfully generated ${clips.length}/${scenes.length} clips`);

    // ── Step 3: Clean up old clips (keep last 20 sessions only) ──
    try {
      const allFiles = fs.readdirSync(VIDEOS_DIR).filter(f => f.startsWith("clip_"));
      if (allFiles.length > 100) {
        const sorted = allFiles.sort();
        const toDelete = sorted.slice(0, sorted.length - 100);
        toDelete.forEach(f => fs.unlinkSync(path.join(VIDEOS_DIR, f)));
        console.log(`🧹 Cleaned ${toDelete.length} old video clips`);
      }
    } catch {}

    return res.json({
      clips,
      sessionId,
      chapter,
      totalClips: clips.length,
      type: "playlist",
    });

  } catch (err) {
    console.error("Video generation error:", err);
    return res.status(500).json({ error: "An unexpected error occurred.", fallback: "youtube" });
  }
});

// ═══════════════════════════════════════════════════
// AUTH MIDDLEWARE & USER HISTORY API (Supabase)
// ═══════════════════════════════════════════════════

// Auth middleware — verifies Supabase JWT access token
async function verifyAuth(req, res, next) {
  if (!supabase) {
    return res.status(503).json({ error: "Auth not configured" });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No auth token provided" });
  }
  try {
    const token = authHeader.split("Bearer ")[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid auth token" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid auth token" });
  }
}

// Serve Supabase client config to frontend (only public keys)
app.get("/api/auth-config", (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.json({ configured: false });
  }
  res.json({
    configured: true,
    config: {
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
    },
  });
});

// GET /api/history — fetch user's study history
app.get("/api/history", verifyAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("study_history")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ history: data || [] });
  } catch (err) {
    console.error("History fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// POST /api/history — save a study session
app.post("/api/history", verifyAuth, async (req, res) => {
  try {
    const { classNum, subject, chapter, topic, step, data } = req.body;
    if (!classNum || !subject || !chapter) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    // Upsert: use user_id + class + subject + chapter as unique key
    const sessionKey = `${classNum}-${subject}-${chapter}`.replace(/[^a-zA-Z0-9-]/g, "_");

    const { data: existing } = await supabase
      .from("study_history")
      .select("id, steps")
      .eq("user_id", req.user.id)
      .eq("session_key", sessionKey)
      .single();

    if (existing) {
      // Update existing entry
      const updatedSteps = { ...(existing.steps || {}), ...(step ? { [step]: true } : {}) };
      const { error } = await supabase
        .from("study_history")
        .update({
          steps: updatedSteps,
          latest_data: data || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) throw error;
      res.json({ success: true, sessionId: existing.id });
    } else {
      // Insert new entry
      const { data: newEntry, error } = await supabase
        .from("study_history")
        .insert({
          user_id: req.user.id,
          session_key: sessionKey,
          class_num: classNum,
          subject,
          chapter,
          topic: topic || "",
          steps: step ? { [step]: true } : {},
          latest_data: data || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      res.json({ success: true, sessionId: newEntry?.id });
    }

    // Update user profile in profiles table
    await supabase.from("profiles").upsert({
      id: req.user.id,
      email: req.user.email || "",
      display_name: req.user.user_metadata?.full_name || req.user.user_metadata?.name || "",
      avatar_url: req.user.user_metadata?.avatar_url || "",
      last_active: new Date().toISOString(),
    });
  } catch (err) {
    console.error("History save error:", err.message);
    res.status(500).json({ error: "Failed to save history" });
  }
});

// DELETE /api/history — clear all history for user
app.delete("/api/history", verifyAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from("study_history")
      .delete()
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("History clear error:", err.message);
    res.status(500).json({ error: "Failed to clear history" });
  }
});

// DELETE /api/history/:id — delete a single history entry
app.delete("/api/history/:id", verifyAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from("study_history")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("History delete error:", err.message);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 NotesGPT server running at http://localhost:${PORT}`);
});
