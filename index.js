const express = require("express");
const { Client } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ตั้งค่าการเชื่อมต่อ LINE API
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET,
};

const client = new Client(config);
app.use(express.json());

// --- Helper Functions for Gemini API ---

/**
 * สร้าง Prompt สำหรับ Gemini เพื่อกำหนดบุคลิกและรูปแบบการตอบกลับ
 * @param {string} userMessage - ข้อความจากผู้ใช้
 * @returns {string} - Prompt ที่รวมคำสั่งและข้อความของผู้ใช้
 */
function createTextPrompt(userMessage) {
  // คำสั่งสำหรับ AI: กำหนดให้เป็นผู้ช่วยผู้หญิงชื่อ 'แก้มใส', พูดจาสุภาพ, ตอบกระชับ, ใช้หางเสียง 'ค่ะ/นะคะ', และไม่ใช้ Markdown
  return `คุณคือผู้ช่วย AI เป็นผู้หญิงชื่อ 'แก้มใส' ช่วยตอบคำถามนี้แบบสุภาพ กระชับ และเป็นกันเอง ใช้หางเสียง 'ค่ะ/นะคะ' และห้ามใช้ Markdown (เช่น ** หรือ *): "${userMessage}"`;
}

/**
 * สร้าง Prompt สำหรับวิเคราะห์รูปภาพ
 * @returns {string} - Prompt สำหรับวิเคราะห์รูปภาพพร้อมคำสั่งกำหนดบุคลิก
 */
function createImagePrompt() {
  return "คุณคือผู้ช่วย AI เป็นผู้หญิงชื่อ 'แก้มใส' ช่วยวิเคราะห์ภาพนี้ให้หน่อยค่ะ ช่วยอธิบายแบบสุภาพ กระชับ และเป็นกันเอง ใช้หางเสียง 'ค่ะ/นะคะ' และไม่ต้องใช้ Markdown (เช่น ** หรือ *):";
}

// --- Gemini API Call Functions ---

/**
 * ฟังก์ชันเรียก Google AI Studio API (Gemini) สำหรับข้อความ
 * @param {string} userMessage - ข้อความจากผู้ใช้
 * @returns {Promise<string>} - คำตอบจาก AI
 */
async function callGeminiAPI(userMessage) {
  const prompt = createTextPrompt(userMessage);
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัยนะคะ ตอนนี้แก้มใสยังตอบคำถามนี้ไม่ได้ค่ะ";
    return aiResponse.trim(); // .trim() เพื่อลบช่องว่างที่ไม่จำเป็น
  } catch (error) {
    console.error("Error calling Gemini API:", error.response?.data || error.message);
    return "ขออภัยนะคะ มีการเรียกใช้งานมากเกินไป ลองใหม่อีกครั้งในภายหลังนะคะ";
  }
}

/**
 * ฟังก์ชันเรียก Google AI Studio API (Gemini) สำหรับรูปภาพ
 * @param {string} imageBase64 - รูปภาพในรูปแบบ Base64
 * @returns {Promise<string>} - คำตอบจาก AI
 */
async function callGeminiAPIWithImage(imageBase64) {
  const prompt = createImagePrompt();
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        // แก้ไขโครงสร้างการส่งข้อมูลให้ถูกต้องตามเอกสารของ Gemini API
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg", // แก้ไข key เป็น camelCase
                data: imageBase64
              }
            }
          ]
        }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัยนะคะ แก้มใสไม่สามารถวิเคราะห์ภาพนี้ได้ค่ะ";
    return aiResponse.trim();
  } catch (error) {
    console.error("Error calling Gemini API with image:", error.response?.data || error.message);
    return "ขออภัยนะคะ ตอนนี้แก้มใสไม่สามารถวิเคราะห์ภาพนี้ได้ ลองใหม่อีกครั้งนะคะ";
  }
}

// --- LINE Server Functions ---

/**
 * ฟังก์ชันดาวน์โหลดรูปจาก LINE Server และแปลงเป็น Base64
 * @param {string} messageId - ID ของข้อความรูปภาพ
 * @returns {Promise<string|null>} - รูปภาพในรูปแบบ Base64 หรือ null หากเกิดข้อผิดพลาด
 */
async function getImageFromLine(messageId) {
  try {
    const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.LINE_ACCESS_TOKEN}` },
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data, "binary").toString("base64");
  } catch (error) {
    console.error("Error downloading image from LINE:", error);
    return null;
  }
}

// --- Express Routes ---

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;
    // ใช้ Promise.all เพื่อจัดการ event ทั้งหมดพร้อมกัน
    await Promise.all(events.map(handleEvent));
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

/**
 * ฟังก์ชันจัดการ Event ที่ได้รับจาก LINE Webhook
 * @param {object} event - Event object จาก LINE
 */
async function handleEvent(event) {
  if (event.type !== "message") {
    return; // ไม่ใช่ event ที่เราสนใจ
  }

  let aiResponse;

  if (event.message.type === "text") {
    const userMessage = event.message.text;
    aiResponse = await callGeminiAPI(userMessage);
  } else if (event.message.type === "image") {
    const imageBase64 = await getImageFromLine(event.message.id);
    if (imageBase64) {
      aiResponse = await callGeminiAPIWithImage(imageBase64);
    } else {
      aiResponse = "ขออภัยค่ะ ไม่สามารถดาวน์โหลดรูปภาพได้";
    }
  } else {
    return; // ไม่รองรับ message ประเภทอื่น
  }

  // ตอบกลับข้อความหาผู้ใช้
  if (aiResponse) {
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: aiResponse,
    });
  }
}


// Route ทดสอบเซิร์ฟเวอร์
app.get("/", (req, res) => {
  res.send("Hello, this is Line Bot with Gemini AI (Kaemsai) on Vercel!");
});

module.exports = app;