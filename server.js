require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");
const { createClient } = require("@supabase/supabase-js");
const HubSpot = require("./hubspot");
const Email = require("./email");

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

const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 3000;

// ── SEO & Performance Middleware ──────────────────────────────

// Gzip all responses — reduces payload by 60-80%, improves Core Web Vitals
app.use(compression());

// Security headers — Google trust signals + XSS/clickjacking protection
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Parse JSON request bodies
app.use(express.json());

// Aggressive cache for static assets (JS, CSS, images) — 1 year
// HTML files get short cache so updates roll out quickly
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1y",
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    } else if (filePath.match(/\.(js|css)$/)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (filePath.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2)$/)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  },
}));


// ── Free models to try (fastest first) ──────────────────────
// Note: Free tier = 50 req/day. Add $10 credits on OpenRouter for 1000/day.
const FREE_MODELS = [
  "google/gemma-3-4b-it:free",                // 0.41s — fastest, good quality
  "google/gemma-3n-e4b-it:free",              // 0.74s — ultra-fast
  "qwen/qwen3-next-80b-a3b-instruct:free",   // 0.98s — best quality MoE
  "meta-llama/llama-3.2-3b-instruct:free",    // 1.01s — reliable fallback
  "google/gemma-3-12b-it:free",               // 0.80s — solid quality
];

// ── Subject mapping per class ────────────────────────────────
const SUBJECTS_BY_CLASS = {
  "1":  ["Maths", "English", "Hindi", "EVS"],
  "2":  ["Maths", "English", "Hindi", "EVS"],
  "3":  ["Maths", "English", "Hindi", "EVS", "Computer"],
  "4":  ["Maths", "English", "Hindi", "EVS", "Computer"],
  "5":  ["Maths", "English", "Hindi", "EVS", "Computer"],
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

// ── Prompt builders (Content-First, Exam-Ready) ──────────────
function buildNotesPrompt(classNum, subject, chapter, topic) {
  const isBoard = ["10", "12"].includes(classNum);
  const examType = isBoard ? "CBSE Board Examination" : `CBSE Class ${classNum} Annual Examination`;
  const topicLine = topic
    ? `\nFOCUS SPECIFICALLY on the topic: "${topic}" within this chapter. Cover this topic in depth — explain it thoroughly with examples, formulas, and diagrams. Do not cover the entire chapter, only this specific topic.`
    : "";

  return `You are an expert CBSE teacher for Class ${classNum} ${subject}. Your goal is to TEACH the student the actual content of this chapter so they deeply understand every concept AND can score full marks.

Generate comprehensive study notes for the chapter: "${chapter}" in subject: "${subject}".${topicLine}

CRITICAL INSTRUCTIONS:
- Base your content STRICTLY on the NCERT textbook for Class ${classNum} ${subject}.
- ACTUALLY EXPLAIN every concept in clear, simple language. Do not just list topics — teach them.
- Include real examples, solved problems, and illustrations wherever applicable.
- Give the EXACT NCERT definitions word-for-word where definitions matter (Science, Social Science).
- For Maths/Physics/Chemistry: include step-by-step solved examples for every important formula.
- For Biology/Social Science: include detailed explanations with cause-effect, processes, and important diagrams to draw.
- Mark frequently examined points with ⭐ so the student knows what to prioritize.

Format the output strictly as:

## 1. ${topic ? `Topic Overview: ${topic}` : "Chapter Overview"}
(A clear 5-8 line explanation of what this chapter/topic is about. Explain the core idea in simple language a Class ${classNum} student can immediately understand.)

## 2. Key Concepts Explained
(For EACH important concept in this chapter:)
- **Concept Name**: Clear 2-4 line explanation in simple words
- Include real-world examples or analogies to make it memorable
- If there is a diagram, describe what to draw and label
- Mark with ⭐ if frequently asked in exams

## 3. Important Definitions & Formulas
(List ALL important definitions and formulas from NCERT for this chapter)
- Write each definition EXACTLY as it appears in NCERT (examiners check for exact wording)
- For each formula: state it, explain each variable, and show one quick solved example
- For non-science subjects: list key terms with their precise meanings

## 4. Solved Examples & Numericals
(Include 3-5 worked-out problems or detailed answers that demonstrate how to apply the concepts)
- Show complete step-by-step solutions
- Cover different types: easy, medium, and one tricky problem
- For non-numerical subjects: write 2-3 model answers for likely exam questions (short answer + long answer format)

## 5. Diagrams & Visual Aids
(List the important diagrams a student must know for this chapter)
- Describe each diagram: what to draw, what to label, key points the examiner checks
- For Maths: include graphs or geometric constructions if relevant
- For History/Geography: mention important maps or timelines

## 6. Common Mistakes to Avoid
(5-8 specific mistakes students make in this chapter that cost them marks)
- What the mistake is → What the correct approach is
- Focus on conceptual errors, not just presentation tips

## 7. Quick Revision Summary
(15-20 crisp one-liner points covering the absolute essentials of this chapter — perfect for last-minute revision before the exam)

Language must be simple, clear, and appropriate for a Class ${classNum} student. TEACH the content — do not just list exam tips.`;
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

// ── Daily limit cache — avoids wasting time retrying OpenRouter ──
let _dailyLimitHit = false;
let _dailyLimitResetAt = 0;

function isDailyLimitActive() {
  if (!_dailyLimitHit) return false;
  if (Date.now() > _dailyLimitResetAt) {
    _dailyLimitHit = false; // expired, try OpenRouter again
    return false;
  }
  return true;
}

function markDailyLimitHit() {
  _dailyLimitHit = true;
  // Reset after 1 hour (or at next midnight UTC, whichever is sooner)
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  const msToMidnight = midnight.getTime() - now.getTime();
  _dailyLimitResetAt = Date.now() + Math.min(msToMidnight, 3600000);
  console.log(`⛔ Daily free limit cached — skipping OpenRouter for ${Math.round(Math.min(msToMidnight, 3600000) / 60000)}min`);
}

// ── Bytez models — same families as OpenRouter list ──
const BYTEZ_MODELS = [
  "Qwen/Qwen2.5-3B-Instruct",       // Qwen family (matches Qwen 3.6)
  "THUDM/glm-4-9b-chat",            // GLM family (matches GLM 4.5 Air)
  "Qwen/Qwen2-1.5B-Instruct",       // Qwen fallback (smaller)
  "HuggingFaceTB/SmolLM2-1.7B-Instruct",
  "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
];

async function callOpenRouter(apiKey, systemMsg, prompt, maxTokens = 2048) {

  // ── FAST PATH: if daily limit already cached, skip straight to Bytez ──
  if (isDailyLimitActive()) {
    console.log(`⚡ Daily limit cached — going directly to Bytez`);
  } else {
    // ── Try OpenRouter free models ──
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
            "HTTP-Referer": "https://notesgpt.online",
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
          
          // Remove markdown wrappers
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
          
          // Daily free limit hit — cache it and skip to Bytez immediately
          if (response.status === 429 && errBody.includes("free-models-per-day")) {
            markDailyLimitHit();
            break;
          }
          // Per-minute rate limit — wait briefly then try next model
          if (response.status === 429 && errBody.includes("per-min")) {
            console.log(`⏸️  Per-minute rate limit — waiting 5s...`);
            await new Promise(r => setTimeout(r, 5000));
          }
        }
      } catch (err) {
        console.warn(`⚠️  ${model} threw exception: ${err.message}`);
      }
    }
  }

  // ── FALLBACK: Bytez API ──
  const bytezKey = process.env.BYTEZ_API_KEY;
  if (bytezKey) {
    console.log(`🔌 Switching to Bytez API (${BYTEZ_MODELS.length} models)`);

    for (const bModel of BYTEZ_MODELS) {
      await new Promise(r => setTimeout(r, 1500)); // respect 1-req-at-a-time

      try {
        console.log(`⏳ Trying Bytez: ${bModel}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000);

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

    const systemMsg = "You are an expert CBSE teacher who TEACHES content thoroughly. Explain every concept clearly with examples, solved problems, and diagrams. Use markdown formatting with headings (##), bullet points, bold for emphasis, and proper mathematical notation. Prioritize actual explanations over exam-writing tips.";
    const prompt = buildNotesPrompt(classNum, subject, chapter.trim(), topic || "");
    const notes = await callOpenRouter(apiKey, systemMsg, prompt, 4000);

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
    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 4000);

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
    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 4000);

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
          is_correct: false,
          correct_answer: q.answer || "",
          feedback: answer.length === 0
            ? `No answer provided. The correct answer is: ${q.answer}`
            : `Answer too short. The correct answer is: ${q.answer}`,
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

    const systemMsg = `You are an expert CBSE exam evaluator. Your job is to CAREFULLY compare each student's answer against the correct answer and key points. Be HONEST and PRECISE — award marks ONLY for correct content. If the answer is wrong, say so clearly and give the correct answer. Output ONLY a valid JSON array.`;

    const prompt = `You are evaluating a CBSE Class ${classNum || "10"} student's test. For EACH question below, carefully compare the student's answer with the correct answer.

${qaText}

EVALUATION RULES — FOLLOW THESE EXACTLY:

1. READ the correct answer and key points carefully
2. READ the student's answer carefully
3. CHECK: Does the student's answer actually match the correct answer?
   - For MCQ: Is the selected option correct? If wrong → 0 marks
   - For Short Answer: Are the key facts/definitions/formulas present and correct?
   - For Long Answer: Are ALL key points covered? Is the explanation accurate?
4. Be HONEST:
   - WRONG answer → 0 marks, explain the correct answer
   - PARTIALLY correct → proportional marks, state what was missing
   - CORRECT but incomplete → deduct for missing key points
   - FULLY correct with all key points → full marks
5. ALWAYS state the correct answer in your feedback when the student gets it wrong or partially wrong
6. NEVER give marks for vague, off-topic, or incorrect responses just because they are long

For EACH question, output a JSON object with these EXACT fields:

[
  {
    "marks_awarded": <number between 0 and total_marks>,
    "total_marks": <from the question>,
    "is_correct": <true if marks_awarded equals total_marks, false otherwise>,
    "correct_answer": "<the actual correct answer, stated clearly — ALWAYS include this>",
    "feedback": "<2-3 sentences: what the student got right, what they got wrong, and what the correct answer is>",
    "improvement_tip": "<1 specific, actionable tip to answer this type of question better>"
  }
]

CRITICAL: Output ONLY the JSON array. No markdown, no explanation outside the JSON.`;


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
          is_correct: marks >= q.marks,
          correct_answer: q.answer,
          feedback: marks === 0
            ? `Incorrect. The correct answer is: ${q.answer}`
            : marks >= q.marks
              ? "Correct! All key points covered."
              : `Partially correct (${matched}/${totalPoints} key points). Correct answer: ${q.answer}`,
          improvement_tip: "Review the correct answer and ensure all key points are included.",
        };
      });
    } else {
      // ── Merge AI results into pre-scored array ──
      toEvaluate.forEach((item, aiIdx) => {
        const r = aiResults[aiIdx] || {};
        const maxMarks = item.question.marks;
        const awarded = Math.min(Math.max(Number(r.marks_awarded) || 0, 0), maxMarks);
        preScored[item.originalIndex] = {
          marks_awarded: awarded,
          total_marks: maxMarks,
          is_correct: awarded >= maxMarks,
          correct_answer: String(r.correct_answer || item.question.answer || "").trim(),
          feedback: String(r.feedback || "Evaluated by AI.").trim(),
          improvement_tip: String(r.improvement_tip || "").trim(),
        };
      });
    }

    // ── Fill any gaps (safety) ──
    const finalResults = preScored.map((r, i) => r || {
      marks_awarded: 0,
      total_marks: questions[i].marks,
      is_correct: false,
      correct_answer: questions[i].answer || "",
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

    // ── Enhanced system prompt with action detection ──
    const systemMsg = `You are NotesGPT AI — a powerful CBSE study assistant. You can:
1. Answer doubts clearly
2. Detect when the student wants a specific feature and respond accordingly

IMPORTANT — INTENT DETECTION:
If the student asks for ANY of these, you MUST include the action tag at the VERY END of your response:

- Song/memory song/jingle/rap/melody → add: [ACTION:SONG]
- Flashcards/flash cards/revision cards → add: [ACTION:FLASHCARDS]
- Mind map/concept map/visual map → add: [ACTION:MINDMAP]
- Audiobook/audio lesson/read aloud → add: [ACTION:AUDIOBOOK]
- Video/visual lesson/animation/AI video → add: [ACTION:VIDEO]
- Notes/summary/chapter notes → add: [ACTION:NOTES]
- Practice questions/MCQs/quiz → add: [ACTION:PRACTICE]
- Mock test/full test/exam paper → add: [ACTION:TEST]

Examples:
- "Make a song about periodic table" → explain + [ACTION:SONG]
- "Generate flashcards for photosynthesis" → explain + [ACTION:FLASHCARDS]
- "Create a mind map of Indian constitution" → explain + [ACTION:MINDMAP]
- "I want an audiobook for this chapter" → explain + [ACTION:AUDIOBOOK]

If the student is just asking a normal doubt, do NOT add any action tag. Just answer the doubt.`;

    const prompt = `You are helping a CBSE Class ${classNum || 10} student.

Subject: ${subject || "General"}
Chapter: ${chapter || "General"}

Student's request:
"${question.trim()}"

${focusHint}${moreDetail}

Instructions:
- If this is a GENERATION REQUEST (song, flashcards, mind map, audiobook, video, notes, practice, test), write a short friendly confirmation message (1-2 sentences) about what you're about to generate, then add the appropriate [ACTION:XXX] tag at the very end.
- If this is a DOUBT/QUESTION, explain clearly in simple language appropriate for Class ${classNum || 10}. Keep it exam-focused (CBSE style). Use step-by-step explanation if needed. Include a short example if helpful. Highlight the key concept.

For doubts, format your response as:

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

    // ── Parse action tags from response ──
    const actionMatch = raw.match(/\[ACTION:(SONG|FLASHCARDS|MINDMAP|AUDIOBOOK|VIDEO|NOTES|PRACTICE|TEST)\]/i);
    let action = null;
    let cleanAnswer = raw.trim();

    if (actionMatch) {
      action = actionMatch[1].toUpperCase();
      cleanAnswer = cleanAnswer.replace(/\[ACTION:\w+\]/gi, "").trim();
    }

    console.log(`💡 Doubt solved for Class ${classNum} ${subject}${action ? ` → ACTION: ${action}` : ""}`);
    return res.json({ answer: cleanAnswer, action });
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

// ── API route: generate audiobook (AI script → edge-tts Neural MP3) ─
// Uses Microsoft's Neural TTS engine — completely free, no API key needed
// Returns a real MP3 file URL with studio-quality voice
app.post("/api/generate-audio-script", async (req, res) => {
  try {
    const { classNum, subject, chapter, summaryText } = req.body;

    if (!chapter || !summaryText) {
      return res.status(400).json({ error: "Chapter and summary text are required." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server misconfiguration." });

    // ── Step 1: Generate a clean narration script via AI ──
    const systemMsg = "You are a friendly, engaging CBSE teacher narrating a lesson. Output ONLY the spoken script — plain conversational sentences. No markdown, no bullet points, no headings, no special characters. No asterisks or symbols.";
    const prompt = `Convert the following study notes into a natural spoken narration script for a Class ${classNum || 10} ${subject || "Science"} student.

Chapter: "${chapter}"

Rules:
- Write ONLY what would be spoken aloud — plain sentences only
- Speak directly to the student: use "you" and "we"
- Use transitions: "Now let's look at...", "The important thing here is...", "Remember that..."
- Keep it to 300-500 words (about 3-4 minutes spoken)
- Emphasize exam points naturally: "This is very important for your exam..."
- Use comma placement for natural breathing rhythm
- End with: "Good luck with your exam. You've got this."
- NO markdown, NO asterisks, NO bullet points, NO headings — just plain spoken text

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

    let script;
    if (!raw) {
      script = cleanScript(summaryText);
    } else {
      script = cleanScript(raw);
    }

    const wordCount = script.split(/\s+/).length;
    console.log(`🎧 Audiobook script ready: ~${wordCount} words`);

    // ── Step 2: Convert script to MP3 using Microsoft Neural TTS ──
    try {
      const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

      // Ensure audio directory exists
      const audioDir = path.join(__dirname, "public", "audio");
      if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

      // Generate unique filename
      const filename = `audiobook_${Date.now()}.mp3`;
      const filePath = path.join(audioDir, filename);

      // Use an Indian English Neural voice for CBSE students
      // Alternatives: en-US-AriaNeural, en-US-GuyNeural, en-GB-SoniaNeural
      const voice = "en-IN-NeerjaExpressiveNeural";

      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

      const { audioStream } = tts.toStream(script);
      const writeStream = fs.createWriteStream(filePath);
      
      audioStream.pipe(writeStream);

      // Wait for file to finish writing
      await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        audioStream.on("error", reject);
      });

      const fileSize = fs.statSync(filePath).size;
      console.log(`✅ Neural TTS audio saved: ${filename} (${Math.round(fileSize / 1024)}KB)`);

      return res.json({
        audio_url: `/audio/${filename}`,
        script,
        wordCount,
        estimatedMinutes: Math.ceil(wordCount / 140),
        type: "audio-file",
        voice,
      });

    } catch (ttsErr) {
      console.warn("⚠️ Edge-TTS failed, falling back to text-only:", ttsErr.message);
      // Fallback: return script for browser TTS
      return res.json({
        script,
        wordCount,
        estimatedMinutes: Math.ceil(wordCount / 140),
        type: "text-only",
      });
    }

  } catch (err) {
    console.error("Audiobook error:", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ── API route: generate memory song (Google Lyria 3 Pro → real sung lyrics) ─
// Primary: Google Lyria 3 Pro via OpenRouter (48kHz stereo music + vocals)
// Fallback: Bytez suno/bark (speech-style singing)
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

    // ── Step 1: Generate lyrics via AI ──
    const level = performanceLevel || "medium";
    const mood = level === "high" ? "celebratory, upbeat, victorious" :
                 level === "low"  ? "motivational, encouraging, comeback" :
                                    "focused, steady, educational";

    const points = keyPoints || chapter;
    const systemMsg = "You are a creative songwriter who writes catchy educational songs. Output ONLY the song lyrics, nothing else. No titles, no brackets, no instructions.";
    const lyricsPrompt = `Create a short educational song for a CBSE Class ${classNum || 10} student.

Subject: ${subject || "General"}
Chapter: ${chapter}

Key points to cover:
${typeof points === "string" ? points : JSON.stringify(points)}

Requirements:
- Write 8-12 lines of catchy, rhythmic lyrics
- Include important formulas, definitions, or concepts from the chapter
- Make it extremely memorable and fun to sing
- Use simple language a student would enjoy
- The mood should be: ${mood}
- Structure: verse, chorus, verse format
- Make every line teach something from the chapter
- Do NOT include any titles, section labels, or brackets

Output song lyrics only. Nothing else.`;

    const lyrics = await callOpenRouter(apiKey, systemMsg, lyricsPrompt, 600);
    if (!lyrics) {
      return res.status(502).json({ error: "Failed to generate lyrics." });
    }

    const cleanLyrics = lyrics
      .replace(/\*\*/g, "").replace(/\*/g, "")
      .replace(/#/g, "").replace(/\[.*?\]/g, "")
      .replace(/^(Verse|Chorus|Bridge|Outro|Intro).*$/gmi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    console.log(`🎵 Generated lyrics: ${cleanLyrics.split(/\s+/).length} words`);

    // ── Style config ──
    const styleLabel = level === "high" ? "Victory Anthem" :
                       level === "low"  ? "Comeback Track" :
                                          "Study Groove";

    // ── Step 2: Try Google Lyria 3 Pro (real AI music with vocals via OpenRouter) ──
    try {
      console.log("🎶 Attempting Google Lyria 3 Pro music generation...");

      const musicPrompt = `Create a catchy educational song for students about "${chapter}" (${subject || "General"}, Class ${classNum || 10}).

The song should:
- Be ${mood} in mood
- Style: ${styleLabel}
- Have clear vocals singing the following lyrics:

${cleanLyrics}

Make it extremely catchy, memorable, and suitable for students to learn from. Include a full instrumental arrangement with vocals.`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

      const lyResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://notesgpt.online",
          "X-Title": "NotesGPT",
        },
        body: JSON.stringify({
          model: "google/lyria-3-pro-preview",
          messages: [
            { role: "user", content: musicPrompt },
          ],
          modalities: ["audio"],
          audio: { format: "mp3" },
        }),
      });

      clearTimeout(timeout);

      if (!lyResponse.ok) {
        const errBody = await lyResponse.text();
        console.warn(`⚠️ Lyria Pro failed (${lyResponse.status}): ${errBody.slice(0, 200)}`);
        throw new Error(`Lyria Pro failed: ${lyResponse.status}`);
      }

      const lyData = await lyResponse.json();

      // Extract base64 audio from response
      const audioB64 = lyData.choices?.[0]?.message?.audio?.data;
      if (!audioB64) {
        console.warn("⚠️ Lyria Pro returned no audio data", JSON.stringify(lyData).slice(0, 300));
        throw new Error("No audio data in Lyria response");
      }

      console.log(`✅ Lyria Pro audio received (${Math.round(audioB64.length * 0.75 / 1024)}KB)`);

      // Save audio file
      const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const filename = `song_${sessionId}.mp3`;
      const filePath = path.join(AUDIO_DIR, filename);

      fs.writeFileSync(filePath, Buffer.from(audioB64, "base64"));
      console.log(`✅ Lyria song saved: ${filename}`);

      // Clean up old songs (keep last 20)
      try {
        const allSongs = fs.readdirSync(AUDIO_DIR).filter(f => f.startsWith("song_"));
        if (allSongs.length > 20) {
          const sorted = allSongs.sort();
          sorted.slice(0, sorted.length - 20).forEach(f => fs.unlinkSync(path.join(AUDIO_DIR, f)));
        }
      } catch {}

      return res.json({
        audio_url: `/audio/${filename}`,
        lyrics: cleanLyrics,
        style: styleLabel,
        tags: [mood],
        engine: "lyria-3-pro",
      });

    } catch (lyriaErr) {
      console.warn("⚠️ Lyria Pro failed, falling back to TTS:", lyriaErr.message);
      // Fall through to TTS fallback below
    }

    // ── Step 3: Fallback — Bytez suno/bark (speech-style singing) ──
    const bytezKey = process.env.BYTEZ_API_KEY;
    if (!bytezKey) {
      // No fallback available — return lyrics only
      return res.json({
        lyrics: cleanLyrics,
        style: styleLabel,
        tags: [],
        engine: "lyrics-only",
        error: "Music generation unavailable. Here are your lyrics to sing along!",
      });
    }

    const styleTags = level === "high"
      ? ["pop", "upbeat", "energetic", "happy"]
      : level === "low"
      ? ["acoustic", "inspiring", "warm", "motivational"]
      : ["pop", "chill", "educational", "medium tempo"];

    // Format for Bark singing
    let barkPrompt = cleanLyrics;
    if (!barkPrompt.includes("♪")) {
      barkPrompt = barkPrompt.split("\n").filter(l => l.trim())
        .map(line => `♪ ${line.trim()} ♪`)
        .join("\n");
    }

    console.log(`🎤 Sending to Bark for singing: ${barkPrompt.slice(0, 80)}...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);

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

    // Save WAV to public/audio/
    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const filename = `song_${sessionId}.wav`;
    const filePath = path.join(AUDIO_DIR, filename);

    const audioBuffer = Buffer.from(audioBase64, "base64");
    fs.writeFileSync(filePath, audioBuffer);

    console.log(`✅ Memory song saved: ${filename} (${Math.round(audioBuffer.length / 1024)}KB)`);

    // Clean up old songs (keep last 20)
    try {
      const allSongs = fs.readdirSync(AUDIO_DIR).filter(f => f.startsWith("song_"));
      if (allSongs.length > 20) {
        const sorted = allSongs.sort();
        sorted.slice(0, sorted.length - 20).forEach(f => fs.unlinkSync(path.join(AUDIO_DIR, f)));
      }
    } catch {}

    return res.json({
      audio_url: `/audio/${filename}`,
      lyrics: cleanLyrics,
      style: styleLabel,
      tags: styleTags,
      engine: "bark",
    });
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("⚠️ Song generation timed out");
      return res.status(504).json({ error: "Song generation timed out." });
    }
    console.error("Music generation error:", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ── API route: generate AI Visual Lesson (Pollinations + Neural TTS) ────
// Generates 6-8 educational images + per-slide Neural TTS voiceover
// Frontend plays as a seamless auto-playing video — no manual navigation
const IMAGES_DIR = path.join(__dirname, "public", "images", "slides");
const SLIDE_AUDIO_DIR = path.join(__dirname, "public", "audio", "slides");
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(SLIDE_AUDIO_DIR)) fs.mkdirSync(SLIDE_AUDIO_DIR, { recursive: true });

app.post("/api/generate-video", async (req, res) => {
  try {
    const { classNum, subject, chapter } = req.body;

    if (!chapter) {
      return res.status(400).json({ error: "Chapter is required." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenRouter API key not configured.", fallback: "youtube" });
    }

    // ── Step 1: Generate 6-8 scene descriptions + detailed narration ──
    console.log(`🎬 Step 1: Generating visual lesson scenes for "${chapter}"...`);

    const sceneSystemMsg = `You are an expert CBSE teacher creating a video lesson. Generate scene descriptions with spoken narration for an illustrated educational video.
Output ONLY a valid JSON array, no other text. Each element must have "image_prompt", "narration", and "title" fields.`;

    const scenePrompt = `Create exactly 7 illustrated scenes for a complete visual lesson about CBSE Class ${classNum || 10} ${subject || ""} chapter: "${chapter}".

Structure the 7 scenes like a real video lesson:
Scene 1: INTRODUCTION — Hook the student, state what they'll learn
Scene 2-3: CORE CONCEPTS — Explain the fundamental ideas with visuals
Scene 4-5: DETAILED EXPLANATION — Dive deeper with diagrams, processes, formulas
Scene 6: EXAM FOCUS — Important questions, common mistakes, marking scheme tips
Scene 7: SUMMARY & REVISION — Quick recap of everything covered

Rules for image_prompt:
- Write detailed visual descriptions for AI image generation (Flux model)
- Describe specific diagrams, objects, colors, labels, arrows, and layout
- Use styles like: "educational illustration", "scientific diagram", "labeled infographic", "textbook figure"
- Include text labels, annotations, and color coding in the description
- Each prompt should create a DIFFERENT type of visual (diagram, chart, flowchart, comparison table, mind map, etc.)
- Max 40 words per prompt

Rules for narration:
- Write 3-5 natural spoken sentences per scene (60-100 words each)
- Use a warm, engaging teacher's voice: "Let's look at...", "Notice how...", "The key thing to remember is..."
- Include specific facts, definitions, formulas, and exam-relevant details
- End each narration with a connector to the next scene
- Make it conversational — like a real teacher explaining in class

Rules for title:
- Short 3-6 word title for the scene (shown as chapter marker)

Format as JSON array:
[
  {"title": "...", "image_prompt": "...", "narration": "..."},
  {"title": "...", "image_prompt": "...", "narration": "..."},
  ...
]`;

    const sceneRaw = await callOpenRouter(apiKey, sceneSystemMsg, scenePrompt, 3000);

    let scenes = [];
    if (sceneRaw) {
      try {
        const parsed = JSON.parse(sceneRaw);
        if (Array.isArray(parsed)) scenes = parsed.slice(0, 8);
      } catch {
        const match = sceneRaw.match(/\[[\s\S]*\]/);
        if (match) {
          try { scenes = JSON.parse(match[0]).slice(0, 8); } catch {}
        }
      }
    }

    scenes = scenes.filter(s => s && s.image_prompt && s.narration);

    // Fallback scenes if AI fails
    if (scenes.length < 3) {
      scenes = [
        { title: "Introduction", image_prompt: `Colorful educational title card for ${chapter}, modern textbook cover style, CBSE Class ${classNum}, subject text overlay, professional`, narration: `Welcome to this visual lesson on ${chapter}! In the next few minutes, we'll cover all the key concepts you need to know for your exam. Pay close attention to the diagrams and explanations — they'll help you understand and remember everything better. Let's dive right in!` },
        { title: "Key Concepts", image_prompt: `Detailed educational diagram illustrating the core concepts of ${chapter}, labeled arrows, color-coded sections, textbook style, clean white background`, narration: `Let's start with the fundamentals. Understanding these core concepts is absolutely crucial because most exam questions are based on them. Take a moment to study the diagram carefully — notice how each part connects to the others. This interconnection is what examiners love to test.` },
        { title: "Process Breakdown", image_prompt: `Step-by-step flowchart showing the main process in ${chapter}, numbered steps, colorful arrows, educational infographic style`, narration: `Now let's break down the main process step by step. Follow the arrows in the flowchart — each step leads naturally to the next. This is a very commonly asked question in board exams, so make sure you can explain each step in your own words.` },
        { title: "Important Formulas", image_prompt: `Clean infographic showing key formulas and definitions for ${chapter}, highlighted boxes, mathematical notation, study notes layout`, narration: `Here are the important formulas and definitions you must memorize. These appear in almost every exam paper. I recommend writing them down at least three times — research shows that writing helps lock information into your long-term memory.` },
        { title: "Diagrams & Labels", image_prompt: `Detailed scientific diagram with labeled parts related to ${chapter}, arrows pointing to key features, magnified sections, educational illustration`, narration: `This labeled diagram is worth studying carefully. In board exams, you often get questions asking you to draw and label these structures. Make sure you know every label — even the small details can earn you important marks.` },
        { title: "Exam Tips", image_prompt: `Exam preparation tips infographic for ${chapter}, common mistakes highlighted in red, correct approaches in green, checklist style`, narration: `Before we wrap up, here are some critical exam tips. These are the most common mistakes students make in this chapter — and how to avoid them. Remember: read the question twice, label your diagrams clearly, and always show your working.` },
        { title: "Quick Revision", image_prompt: `Summary mind map of ${chapter} with all key points connected, colorful branches, central theme, revision card style`, narration: `And that's a wrap! Let's do a quick recap of everything we covered. Look at this mind map — it connects all the major concepts from this chapter. Use this as your last-minute revision tool before the exam. You've got this — now go ace that test!` },
      ];
    }

    console.log(`📝 Generated ${scenes.length} scene descriptions`);

    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // ── Step 2: Generate images + TTS audio in parallel ──
    console.log(`🖼️ Step 2: Generating ${scenes.length} images + audio...`);

    const slidePromises = scenes.map(async (scene, idx) => {
      const result = { index: idx, title: scene.title || `Scene ${idx + 1}`, narration: scene.narration };

      // Generate image
      try {
        const prompt = encodeURIComponent(scene.image_prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1280&height=720&nologo=true&seed=${Date.now() + idx}`;

        console.log(`  🖼️ Scene ${idx + 1}: image...`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        const imgRes = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (imgRes.ok) {
          const filename = `vl_${sessionId}_${idx}.jpg`;
          const filePath = path.join(IMAGES_DIR, filename);
          const arrayBuf = await imgRes.arrayBuffer();
          fs.writeFileSync(filePath, Buffer.from(arrayBuf));
          result.imageUrl = `/images/slides/${filename}`;
          console.log(`  ✅ Scene ${idx + 1} image saved (${Math.round(arrayBuf.byteLength / 1024)}KB)`);
        }
      } catch (err) {
        console.warn(`  ⚠️ Scene ${idx + 1} image error: ${err.message}`);
      }

      // Generate TTS audio using msedge-tts (same voice as audiobook)
      try {
        const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
        const audioFilename = `vl_${sessionId}_${idx}.mp3`;
        const audioPath = path.join(SLIDE_AUDIO_DIR, audioFilename);

        const tts = new MsEdgeTTS();
        await tts.setMetadata("en-IN-NeerjaExpressiveNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

        // Clean narration text
        const cleanText = scene.narration.replace(/[*#_~`]/g, "").trim();
        const { audioStream } = tts.toStream(cleanText);
        const writeStream = fs.createWriteStream(audioPath);
        audioStream.pipe(writeStream);

        await new Promise((resolve, reject) => {
          writeStream.on("finish", resolve);
          writeStream.on("error", reject);
          audioStream.on("error", reject);
        });

        result.audioUrl = `/audio/slides/${audioFilename}`;
        const size = fs.statSync(audioPath).size;
        console.log(`  🔊 Scene ${idx + 1} audio saved (${Math.round(size / 1024)}KB)`);
      } catch (err) {
        console.warn(`  ⚠️ Scene ${idx + 1} audio error: ${err.message}`);
      }

      return result;
    });

    const slideResults = await Promise.all(slidePromises);
    const slides = slideResults
      .filter(s => s.imageUrl) // must have an image at minimum
      .sort((a, b) => a.index - b.index);

    if (slides.length === 0) {
      console.warn("⚠️ All slides failed, falling back to YouTube");
      return res.status(502).json({
        error: "Visual lesson generation failed.",
        fallback: "youtube",
      });
    }

    console.log(`🎬 Visual lesson ready: ${slides.length} scenes with neural voiceover`);

    // ── Step 3: Clean up old files (keep last 60) ──
    try {
      for (const dir of [IMAGES_DIR, SLIDE_AUDIO_DIR]) {
        const allFiles = fs.readdirSync(dir).filter(f => f.startsWith("vl_") || f.startsWith("slide_"));
        if (allFiles.length > 60) {
          const sorted = allFiles.sort();
          sorted.slice(0, sorted.length - 60).forEach(f => fs.unlinkSync(path.join(dir, f)));
        }
      }
    } catch {}

    return res.json({
      slides,
      sessionId,
      chapter,
      subject,
      classNum,
      totalSlides: slides.length,
      type: "video_lesson",
    });

  } catch (err) {
    console.error("Visual lesson generation error:", err);
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

// ── HubSpot CRM Tracking Endpoint ───────────────────────────
// Frontend calls this after every major study event.
// Works for both logged-in users and anonymous landing page visitors.
app.post("/api/hubspot/track", async (req, res) => {
  // Fire-and-forget — never block the user experience
  res.json({ ok: true });

  try {
    const { email, eventType, data } = req.body;
    if (!email || !eventType) return;

    if (eventType === "signup") {
      // CRM sync
      await HubSpot.onStudentSignup({ email, user_metadata: data || {} });
      // Welcome email
      Email.sendWelcomeEmail(email, {
        name: data?.full_name || email.split("@")[0],
        provider: data?.provider || "email",
      });
    } else if (eventType === "notes_generated") {
      await HubSpot.onStudyEvent(email, eventType, data || {});
      // Study summary email
      Email.sendStudySummaryEmail(email, {
        name: email.split("@")[0],
        classNum: data?.class_level || "",
        subject: data?.subject || "",
        chapter: data?.chapter || "",
        wordCount: data?.word_count || 500,
      });
    } else if (eventType === "test_submitted") {
      await HubSpot.onStudyEvent(email, eventType, data || {});
      // Test score email
      if (data?.score !== undefined && data?.total) {
        Email.sendTestScoreEmail(email, {
          name: email.split("@")[0],
          classNum: data?.class_level || "",
          subject: data?.subject || "",
          chapter: data?.chapter || "",
          score: data.awarded ?? data.score,
          total: data.total,
        });
      }
    } else if (eventType === "landing_cta_clicked") {
      await HubSpot.upsertContact(email, {
        lead_source: "Landing Page CTA",
        lifecyclestage: "lead",
        notesgpt_engagement_tier: "new",
      });
      await HubSpot.logStudyEvent(email, "landing_cta_clicked", data || {});
    } else {
      await HubSpot.onStudyEvent(email, eventType, data || {});
    }
  } catch (err) {
    console.warn("⚠️ HubSpot track error (non-fatal):", err.message);
  }
});

// ── Email: Streak Reminder Cron Endpoint ─────────────────────────
// Call this every 24h via Render cron or external scheduler
app.post("/api/email/streak-reminders", async (req, res) => {
  // Secured with a simple secret
  const secret = req.headers["x-cron-secret"] || req.body?.secret;
  if (secret !== (process.env.CRON_SECRET || "notesgpt-cron-2026")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.json({ ok: true, message: "Streak reminders triggered" });

  // Query Supabase for users inactive 2+ days
  if (!supabase) return;
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("email, full_name, last_chapter, last_subject, last_class, last_study_at")
      .lt("last_study_at", twoDaysAgo)
      .not("email", "is", null)
      .limit(100);

    if (error) { console.warn("Streak reminder query error:", error.message); return; }

    let sent = 0;
    for (const p of profiles || []) {
      const daysSince = Math.floor((Date.now() - new Date(p.last_study_at).getTime()) / (1000 * 60 * 60 * 24));
      await Email.sendStreakReminderEmail(p.email, {
        name: p.full_name || p.email.split("@")[0],
        lastChapter: p.last_chapter,
        lastSubject: p.last_subject,
        lastClass: p.last_class,
        daysSince,
      });
      sent++;
    }
    console.log(`📧 Streak reminders sent: ${sent}`);
  } catch (err) {
    console.warn("⚠️ Streak reminder error:", err.message);
  }
});


// ── Start server ─────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 NotesGPT server running at http://localhost:${PORT}`);

  if (process.env.HUBSPOT_API_KEY) {
    console.log("🤝 HubSpot CRM: ACTIVE");
  } else {
    console.warn("⚠️  HubSpot CRM: HUBSPOT_API_KEY not set");
  }

  if (process.env.RESEND_API_KEY) {
    console.log("📧 Resend Email: ACTIVE (welcome, study summary, test scores, streak reminders)");
    Email.testConnection();
  } else {
    console.warn("⚠️  Resend Email: RESEND_API_KEY not set");
  }
});
