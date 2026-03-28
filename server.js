require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Free models to try (fastest first) ───────────────────────
const FREE_MODELS = [
  "liquid/lfm-2.5-1.2b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "qwen/qwen3-4b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "stepfun/step-3.5-flash:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
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

// ── Prompt builders ──────────────────────────────────────────
function buildNotesPrompt(classNum, subject, chapter) {
  return `Generate CBSE Class ${classNum} level study notes for the chapter: "${chapter}" in subject: "${subject}".

Format the output strictly as:

## 1. Chapter Overview
(3-5 lines, simple explanation)

## 2. Key Concepts
(bullet points, exam-focused)

## 3. Important Formulas / Definitions
(if applicable)

## 4. Most Important Points for Exams

## 5. Common Mistakes Students Make

## 6. Quick Revision Summary
(very short)

Ensure the difficulty and explanation level matches Class ${classNum} CBSE standards.
Keep language simple, clear, and optimized for scoring in exams. Avoid unnecessary theory.`;
}

function buildFlashcardPrompt(classNum, subject, chapter) {
  return `Generate CBSE Class ${classNum} flashcards for the chapter: "${chapter}" in subject: "${subject}".

Rules:
- Create 15-25 flashcards
- Keep them exam-focused
- Each flashcard must be short and quick to answer (2-5 seconds)
- No long explanations

Format strictly as a JSON array (no other text, no markdown, just the JSON):

[
  {
    "type": "definition",
    "question": "Front side question",
    "answer": "Short, precise answer"
  }
]

The "type" field must be one of: "definition", "formula", "concept"

Focus on:
- Important definitions
- Key formulas
- Common exam concepts
- Frequently tested points

Keep language simple and optimized for CBSE Class ${classNum} exams.`;
}

function buildQuestionPrompt(classNum, subject, chapter) {
  return `Generate CBSE Class ${classNum} exam-style questions for the chapter: "${chapter}" in subject: "${subject}".

Rules:
- Generate 8-12 questions only (quality over quantity)
- Mix difficulty: easy, medium, hard
- Include:
  - 2 MCQs (with 4 options each)
  - 3 short answer (2-3 marks)
  - 3 long answer (4-5 marks)
  - 1 case-based question (if applicable)

For EACH question, provide:
- Question text
- Step-by-step solution
- Final answer
- Marks tip

Format strictly as a JSON array (no other text, no markdown, just the JSON):

[
  {
    "type": "mcq",
    "difficulty": "easy",
    "question": "Question text with options A) B) C) D)",
    "solution_steps": ["Step 1...", "Step 2..."],
    "final_answer": "Option and answer",
    "marks_tip": "How to write for full marks"
  }
]

The "type" field must be one of: "mcq", "short", "long", "case"
The "difficulty" field must be one of: "easy", "medium", "hard"

Keep questions aligned with CBSE Class ${classNum} pattern and exam expectations.`;
}

function buildTestPrompt(classNum, subject, chapter) {
  return `Generate a CBSE Class ${classNum} test for the chapter: "${chapter}" in subject: "${subject}".

Rules:
- Total questions: 8-10
- Mix of:
  - 2 MCQs (with 4 options each, 1 mark each)
  - 3 short answer (2-3 marks each)
  - 3 long answer (4-5 marks each)
- Follow CBSE exam pattern strictly

For each question include:
- Question text
- Correct/ideal answer
- Marks for the question
- Key points required for full marks

Format strictly as a JSON array (no other text, no markdown, just the JSON):

[
  {
    "type": "mcq",
    "question": "Question with A) B) C) D) options",
    "answer": "Correct option and answer",
    "marks": 1,
    "key_points": ["Point 1"]
  }
]

The "type" field must be one of: "mcq", "short", "long"

Ensure exam-level quality and clarity for Class ${classNum}.`;
}

function buildEvalPrompt(classNum, questionsAndAnswers) {
  return `Evaluate a CBSE Class ${classNum} student's test answers.

Here are the questions, correct answers, and student's answers:

${questionsAndAnswers}

For EACH question, evaluate the student's answer against the correct answer and key points.
Give marks fairly based on key points covered.

Format strictly as a JSON array (no other text, no markdown, just the JSON):

[
  {
    "marks_awarded": 2,
    "total_marks": 3,
    "feedback": "Brief feedback on what was right/wrong",
    "improvement_tip": "Specific tip to improve"
  }
]

Be fair, exam-oriented, and concise. Give partial marks where appropriate.`;
}

// ── Call OpenRouter with fallback models ──────────────────────
async function callOpenRouter(apiKey, systemMsg, prompt, maxTokens = 2048) {
  for (const model of FREE_MODELS) {
    try {
      console.log(`⏳ Trying model: ${model}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

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
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          console.log(`✅ Success with model: ${model}`);
          return content;
        }
      }

      const errBody = await response.text();
      console.warn(`⚠️  ${model} failed (${response.status}): ${errBody.slice(0, 150)}`);
    } catch (err) {
      console.warn(`⚠️  ${model} threw: ${err.message}`);
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

  return null;
}

// ── API route: generate notes ────────────────────────────────
app.post("/api/generate-notes", async (req, res) => {
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

    const systemMsg = "You are an expert CBSE teacher. Generate well-structured, exam-focused study notes appropriate for the student's class level. Use markdown formatting with headings (##), bullet points, and bold for emphasis.";
    const prompt = buildNotesPrompt(classNum, subject, chapter.trim());
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
        type: ["mcq", "short", "long", "case"].includes(q.type) ? q.type : "short",
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
        type: ["mcq", "short", "long"].includes(q.type) ? q.type : "short",
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
Key Points: ${q.key_points.join(", ")}

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
        const totalPoints = q.key_points.length || 1;
        q.key_points.forEach(kp => {
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

    const systemMsg = "You are a CBSE study helper. Recommend YouTube search queries for students. Output ONLY valid JSON array, no other text.";
    const prompt = `Suggest exactly 2 YouTube video search queries for a CBSE Class ${classNum || 10} student studying ${subject}, chapter "${chapter}" ${topicText}.

Rules:
- Queries should find SHORT (5-15 min) explanation videos
- Focus on exam preparation, not full lectures
- Include both Hindi and English medium options
- Make queries specific enough to find relevant content

Also suggest a known educational YouTube channel for each.

Format strictly as JSON array:

[
  {
    "title": "Short descriptive title of what the video covers",
    "search_query": "exact YouTube search query",
    "channel_hint": "Suggested channel name",
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
          const q = String(v.search_query || `${searchBase} explanation`).trim();
          const encodedQ = encodeURIComponent(q);
          return {
            title: String(v.title || `${chapter} Explanation`).trim(),
            search_query: q,
            url: `https://www.youtube.com/results?search_query=${encodedQ}`,
            thumbnail: `https://img.youtube.com/vi/default/hqdefault.jpg`,
            duration_hint: String(v.duration_hint || "~10 min").trim(),
            channel_hint: String(v.channel_hint || "CBSE Education").trim(),
            focus: String(v.focus || "concept").trim(),
          };
        });
      }
    }

    // Fallback: generate basic search links
    if (videos.length === 0) {
      const q1 = `${searchBase} explanation in Hindi`;
      const q2 = `${searchBase} ${topic || ""} exam preparation`;
      videos = [
        {
          title: `${chapter} — Concept Explanation`,
          search_query: q1,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q1)}`,
          thumbnail: `https://img.youtube.com/vi/default/hqdefault.jpg`,
          duration_hint: "~10 min",
          channel_hint: "CBSE Education",
          focus: "concept",
        },
        {
          title: `${chapter} — Exam Preparation`,
          search_query: q2,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q2)}`,
          thumbnail: `https://img.youtube.com/vi/default/hqdefault.jpg`,
          duration_hint: "~15 min",
          channel_hint: "Study Channel",
          focus: "solving",
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

// ── API route: generate audio script ─────────────────────────
app.post("/api/generate-audio-script", async (req, res) => {
  try {
    const { classNum, subject, chapter, summaryText, mode } = req.body;

    if (!chapter || !summaryText) {
      return res.status(400).json({ error: "Chapter and summary text are required." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfiguration." });
    }

    const isQuick = mode !== "podcast";
    const systemMsg = isQuick
      ? "You are a CBSE teacher. Convert study notes into a clear, spoken audio script. Output ONLY the script text, no formatting."
      : "You are creating an educational podcast. Write a natural teacher-student conversation. Output ONLY the dialogue, no extra text.";

    const prompt = isQuick
      ? `You are a CBSE teacher explaining a chapter to a Class ${classNum || 10} student.

Subject: ${subject || "General"}
Chapter: ${chapter}

Convert the following summary into a short, clear audio script.

Rules:
- Keep it concise (2-4 minutes when spoken)
- Use simple spoken language, as if talking to the student directly
- Focus only on key concepts, formulas, and exam points
- Avoid headings, bullet points, or markdown
- Make it sound natural when spoken aloud
- Use transitions like "Now let's talk about..." or "Remember that..."

Summary:
${summaryText.slice(0, 3000)}

Output a clean spoken script, nothing else.`
      : `Create an educational podcast conversation for a CBSE Class ${classNum || 10} student.

Subject: ${subject || "General"}
Chapter: ${chapter}

Requirements:
- Conversation between Teacher and Student
- Keep it engaging but focused on exams
- Cover key concepts from the summary below
- Include student asking questions
- Highlight common mistakes students make
- Keep it concise (6-8 minutes when spoken)
- Use simple, clear language

Summary:
${summaryText.slice(0, 3000)}

Format each line as:
Teacher: ...
Student: ...

Output only the dialogue, nothing else.`;

    const raw = await callOpenRouter(apiKey, systemMsg, prompt, 3000);

    if (!raw) {
      return res.status(502).json({ error: "AI temporarily busy." });
    }

    // Clean text for speech
    let script = raw
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/#/g, "")
      .replace(/[-•]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const wordCount = script.split(/\s+/).length;
    const estMinutes = Math.round(wordCount / 140); // ~140 words/min spoken

    console.log(`🎧 Generated ${isQuick ? "quick" : "podcast"} script: ~${wordCount} words, ~${estMinutes} min`);
    return res.json({
      script,
      mode: isQuick ? "quick" : "podcast",
      wordCount,
      estimatedMinutes: estMinutes,
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 NotesGPT server running at http://localhost:${PORT}`);
});
