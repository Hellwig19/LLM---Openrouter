import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
const PORT = 3000;
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
const MIN_RECORDS = 5;
const MAX_RECORDS = 100;
const DEFAULT_RECORDS = 8;

if (!API_KEY) {
  console.error("Erro: configure OPENROUTER_API_KEY no arquivo .env.");
  process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

function clampRecordCount(value) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return DEFAULT_RECORDS;
  }

  return Math.min(MAX_RECORDS, Math.max(MIN_RECORDS, parsed));
}

function normalizeFields(fields) {
  if (Array.isArray(fields)) {
    return fields.map((field) => String(field).trim()).filter(Boolean);
  }

  return String(fields || "")
    .split(/[,\n;]/)
    .map((field) => field.trim())
    .filter(Boolean);
}

function normalizeOutputFieldName(field) {
  const lower = String(field || "").trim().toLowerCase();

  if (!lower) {
    return "campo";
  }

  return lower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "campo";
}

function sanitizeModelOutput(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json|sql)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function getFieldSynonyms(fieldName) {
  const normalized = String(fieldName || "").trim().toLowerCase();

  if (/(nome completo|nome|full name|fullname|first name|last name)/i.test(normalized)) {
    return ["nome", "name", "full_name", "fullname", "full name", "first_name", "last_name"];
  }

  if (/(e-?mail|email|correo|mail)/i.test(normalized)) {
    return ["email", "e-mail", "mail", "corporate_email", "corporate email"];
  }

  if (/(status|ativo|inativo|active|inactive)/i.test(normalized)) {
    return ["status", "active", "inactive", "is_active", "isactive"];
  }

  if (/(id|uuid|identificador)/i.test(normalized)) {
    return ["id", "uuid", "identifier"];
  }

  return [normalized];
}

function isDateField(fieldName) {
  return /(data|date|created_at|createdat|creation_date|creationdate)/i.test(String(fieldName || ""));
}

function getDateFieldSynonyms() {
  return ["data_criacao", "created_at", "createdat", "creation_date", "creationdate", "date", "data"];
}

function pickValueBySynonyms(source, fieldName) {
  const synonyms = getFieldSynonyms(fieldName);
  const sourceEntries = Object.entries(source);

  for (const synonym of synonyms) {
    const matchKey = sourceEntries.find(([key]) => key.toLowerCase() === synonym.toLowerCase())?.[0];

    if (matchKey !== undefined) {
      return source[matchKey];
    }
  }

  if (isDateField(fieldName)) {
    for (const synonym of getDateFieldSynonyms()) {
      const matchKey = sourceEntries.find(([key]) => key.toLowerCase() === synonym.toLowerCase())?.[0];

      if (matchKey !== undefined) {
        return source[matchKey];
      }
    }
  }

  return undefined;
}

function normalizeJsonResponse(text, requestedFields) {
  try {
    const parsed = JSON.parse(sanitizeModelOutput(text));

    if (!Array.isArray(parsed)) {
      return JSON.stringify(parsed, null, 2);
    }

    const desiredFields = requestedFields.length > 0 ? requestedFields : ["id", "nome", "email"];

    const normalized = parsed
      .filter((item) => item && typeof item === "object" && !Array.isArray(item))
      .map((item, index) => {
        const normalizedItem = {};
        const sourceEntries = Object.entries(item);

        for (const fieldName of desiredFields) {
          const targetKey = normalizeOutputFieldName(fieldName);
          const value = pickValueBySynonyms(item, fieldName);

          if (value !== undefined) {
            normalizedItem[targetKey] = value;
            continue;
          }

          if (isDateField(fieldName)) {
            const dateEntry = sourceEntries.find(([key]) => isDateField(key));

            if (dateEntry) {
              normalizedItem[targetKey] = dateEntry[1];
            }
          }
        }

        return Object.keys(normalizedItem).length > 0 ? normalizedItem : item;
      });

    return JSON.stringify(normalized, null, 2);
  } catch {
    return sanitizeModelOutput(text);
  }
}

function createSyntheticValue(fieldName, index) {
  const normalized = String(fieldName || "").trim().toLowerCase();
  const firstNames = ["Ana", "Bruno", "Carla", "Diego", "Elaine", "Felipe", "Giovana", "Hugo", "Isabela", "Joao"];
  const lastNames = ["Almeida", "Costa", "Ferreira", "Gomes", "Lima", "Martins", "Nascimento", "Oliveira", "Ribeiro", "Souza"];
  const domains = ["example.com", "company.com", "techcorp.com", "mail.test"];
  const statuses = ["ativo", "inativo", "pendente", "suspenso"];

  if (/(id|uuid|identificador)/i.test(normalized)) {
    return index + 1;
  }

  if (/(nome completo|nome|full name|fullname|first name|last name)/i.test(normalized)) {
    return `${firstNames[index % firstNames.length]} ${lastNames[index % lastNames.length]}`;
  }

  if (/(e-?mail|email|correo|mail)/i.test(normalized)) {
    const first = firstNames[index % firstNames.length].toLowerCase();
    const last = lastNames[index % lastNames.length].toLowerCase();
    return `${first}.${last}${index + 1}@${domains[index % domains.length]}`;
  }

  if (isDateField(normalized)) {
    const month = String((index % 12) + 1).padStart(2, "0");
    const day = String((index % 28) + 1).padStart(2, "0");
    return `2024-${month}-${day}`;
  }

  if (/(status|ativo|inativo|active|inactive)/i.test(normalized)) {
    return statuses[index % statuses.length];
  }

  return `${normalized}_${index + 1}`;
}

function buildJsonFallbackRecords(requestedFields, count) {
  const fields = requestedFields.length > 0 ? requestedFields : ["id", "nome", "email"];

  return Array.from({ length: count }, (_, index) => {
    const record = {};

    for (const fieldName of fields) {
      record[normalizeOutputFieldName(fieldName)] = createSyntheticValue(fieldName, index);
    }

    return record;
  });
}

function rewriteDateFieldKeys(text, requestedFields) {
  const requestedDateField = requestedFields.find((fieldName) => isDateField(fieldName));

  if (!requestedDateField) {
    return text;
  }

  const targetKey = normalizeOutputFieldName(requestedDateField);
  const dateKeys = ["data_criacao", "created_at", "createdat", "creation_date", "creationdate", "date", "data"];

  let rewritten = String(text || "");

  for (const key of dateKeys) {
    const pattern = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"(?=\\s*:)`, "gi");
    rewritten = rewritten.replace(pattern, `"${targetKey}"`);
  }

  return rewritten;
}

function buildInstruction({ fields, format, recordCount }) {
  const cleanedFields = normalizeFields(fields);
  const outputFormat = format === "sql" ? "SQL" : "JSON";
  const count = clampRecordCount(recordCount);
  const outputFields = cleanedFields.map(normalizeOutputFieldName);
  const fieldsLabel = outputFields.length > 0 ? outputFields.join(", ") : "campos informados pelo usuário";

  if (outputFormat === "SQL") {
    return [
      "Gere dados fictícios, mas realistas, para teste de banco de dados.",
      `Retorne exatamente ${count} registros em comandos SQL INSERT INTO prontos para copiar.`,
      "Use apenas texto limpo, sem explicações, sem saudações e sem blocos markdown.",
      "Se precisar assumir nomes de tabela ou colunas, use nomes coerentes com os campos solicitados.",
      `Use exatamente estes nomes de colunas: ${fieldsLabel}.`
    ].join(" ");
  }

  return [
    "Gere dados fictícios, mas realistas, para teste de sistemas.",
    `Retorne exatamente ${count} registros em JSON válido, em um array pronto para copiar.`,
    "Não pare antes de completar a quantidade solicitada.",
    "Use apenas texto limpo, sem explicações, sem saudações e sem blocos markdown.",
    `Use exatamente estas chaves no JSON: ${fieldsLabel}.`
  ].join(" ");
}

function getCompletionTokenLimit(recordCount, format) {
  const count = clampRecordCount(recordCount);
  const perRecordBudget = format === "sql" ? 110 : 80;

  return Math.min(8000, Math.max(1200, count * perRecordBudget + 400));
}

app.get("/api/status", (req, res) => {
  res.json({ status: "API local funcionando", model: MODEL });
});

app.post("/api/llm", async (req, res) => {
  try {
    const { prompt, fields, format, recordCount } = req.body;
    const instruction = prompt?.trim()
      ? prompt.trim()
      : buildInstruction({ fields, format, recordCount });
    const requestedFields = normalizeFields(fields);
    const requestedCount = clampRecordCount(recordCount);
    const outputFormat = format === "sql" ? "sql" : "json";

    if (!instruction) {
      return res.status(400).json({ erro: "Informe os campos para gerar os dados." });
    }

    if (instruction.length > 2000) {
      return res.status(400).json({ erro: "Limite: 2000 caracteres." });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-OpenRouter-Title": "Projeto FIA ADS"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "Você é um gerador estrito de massa de dados fictícios. Siga a solicitação exatamente e retorne apenas o código limpo pedido pelo usuário. Nunca inclua explicações, saudações, comentários, ou marcações markdown. Se a saída for JSON, devolva apenas JSON válido. Se a saída for SQL, devolva apenas comandos INSERT INTO válidos. Gere exatamente a quantidade solicitada pelo usuário, sem limitar a 10 registros."
          },
          {
            role: "user",
            content: instruction
          }
        ],
        temperature: 0.1,
        max_completion_tokens: getCompletionTokenLimit(recordCount, format)
      })
    });

    if (!response.ok) {
      const detalhe = await response.text();
      return res.status(502).json({
        erro: "Erro ao consultar o OpenRouter.",
        status: response.status,
        detalhe
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(502).json({ erro: "Resposta vazia ou inesperada." });
    }

    res.json({
      modelo: MODEL,
      resposta: outputFormat === "json"
        ? (() => {
            const normalizedText = rewriteDateFieldKeys(normalizeJsonResponse(text, requestedFields), requestedFields);

            try {
              const parsed = JSON.parse(normalizedText);

              if (Array.isArray(parsed) && parsed.length < requestedCount) {
                const filler = buildJsonFallbackRecords(requestedFields, requestedCount);
                const merged = parsed.concat(filler.slice(parsed.length, requestedCount));
                return JSON.stringify(merged, null, 2);
              }

              return normalizedText;
            } catch {
              return JSON.stringify(buildJsonFallbackRecords(requestedFields, requestedCount), null, 2);
            }
          })()
        : sanitizeModelOutput(text),
      uso: data.usage || null
    });
  } catch (error) {
    res.status(500).json({ erro: "Erro interno no servidor.", detalhe: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});