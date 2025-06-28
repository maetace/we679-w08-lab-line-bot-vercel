// line-bot-vyw-gemini.js (วิว เวอร์ชันปรับปรุง Gemini 1.5 Flash)

const express = require("express");
const { Client } = require("@line/bot-sdk");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET,
};

const client = new Client(config);
app.use(express.json());

// --- Start of Improvement ---

// 1. เพิ่ม Object สำหรับเก็บ Context ของผู้ใช้แต่ละคน
//    เพื่อจดจำข้อความล่าสุดที่ผู้ใช้ส่งมาก่อนจะส่งรูปภาพ
const userContext = {};

// 2. ปรับปรุงฟังก์ชันเรียก Gemini API สำหรับรูปภาพ
async function callGeminiVisionAPI(prompt, imageBase64) {
  try {
    // 2.1 เปลี่ยนไปใช้โมเดล gemini-1.5-flash-latest ซึ่งเหมาะกับงาน Vision มากขึ้น
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;

    // 2.2 ปรับโครงสร้าง `contents` ให้ถูกต้องสำหรับการส่ง Text และ Image พร้อมกัน
    const requestBody = {
      contents: [{
        parts: [
          { text: prompt }, // ใส่ prompt ที่ได้รับจากผู้ใช้
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: imageBase64,
            },
          },
        ],
      }],
    };

    const response = await axios.post(apiUrl, requestBody, {
      headers: { "Content-Type": "application/json" },
    });

    const aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "อ๊ะ วิวยังวิเคราะห์ภาพนี้ไม่ได้เลย ลองใหม่นะคะ 😜";
    return aiResponse;
  } catch (error) {
    console.error("Error calling Gemini Vision API:", error.response?.data || error.message);
    return "วิวขอโทษนะคะ ตอนนี้ยังวิเคราะห์ภาพนี้ไม่ได้ ลองใหม่อีกทีนะคะ 💛";
  }
}

// --- End of Improvement ---

// ฟังก์ชันสำหรับเรียก API (ข้อความธรรมดา) ยังคงเดิม
async function callGeminiAPI(userMessage) {
  try {
    const response = await axios.post(
      // ใช้โมเดล Flash ตัวล่าสุดเพื่อประสิทธิภาพที่ดี
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: userMessage }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );
    const aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "อ๊ะ วิวยังตอบเรื่องนี้ไม่ได้เลย ลองถามใหม่นะคะ 😜";
    return aiResponse;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "ขอโทษนะคะ ตอนนี้คนใช้เยอะ วิวงอแงนิดนึง ลองใหม่อีกทีนะคะ 💛";
  }
}


async function getImageFromLine(messageId) {
  try {
    const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.LINE_ACCESS_TOKEN}` },
      responseType: "arraybuffer",
    });
    const imageBase64 = Buffer.from(response.data, "binary").toString("base64");
    return imageBase64;
  } catch (error) {
    console.error("Error downloading image from LINE:", error);
    return null;
  }
}

app.post("/webhook", async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message") {
      const userId = event.source.userId; // ดึง userId มาใช้เป็น key

      if (event.message.type === "text") {
        const userMessage = event.message.text;

        // --- Improvement ---
        // 3. จัดเก็บข้อความล่าสุดของผู้ใช้ลงใน context
        userContext[userId] = {
          text: userMessage,
          timestamp: Date.now() // เก็บเวลาไว้ด้วย เผื่อต้องการลบ context ที่เก่าเกินไป
        };

        const aiResponse = await callGeminiAPI(userMessage);
        await client.replyMessage(event.replyToken, { type: "text", text: aiResponse });

      } else if (event.message.type === "image") {
        const imageBase64 = await getImageFromLine(event.message.id);
        if (!imageBase64) {
          await client.replyMessage(event.replyToken, { type: "text", text: "อ๊ะ วิวยังโหลดรูปนี้ไม่ได้ ลองส่งใหม่อีกทีนะคะ 😜" });
          return;
        }

        // --- Improvement ---
        // 4. ตรวจสอบว่ามี context (คำถาม) จากผู้ใช้คนนี้หรือไม่
        let prompt = "วิวช่วยวิเคราะห์รูปนี้ให้หน่อยนะคะ 💛"; // Default prompt
        if (userContext[userId]) {
          // ถ้ามี ให้ใช้ข้อความล่าสุดเป็น prompt
          prompt = userContext[userId].text;
          // หลังจากใช้แล้ว ให้ลบ context ทิ้งไปเลย เพื่อไม่ให้ใช้ซ้ำกับรูปถัดไป
          delete userContext[userId];
        }

        const aiResponse = await callGeminiVisionAPI(prompt, imageBase64);
        await client.replyMessage(event.replyToken, { type: "text", text: aiResponse });
      }
    }
  }
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("สวัสดีค่า วิวเองนะคะ 💛 บอทพร้อมช่วยตอบแล้วค่ะ ถามได้เลยน้า~");
});

module.exports = app;