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

// ฟังก์ชันเรียก Google AI Studio API (Gemini) แบบข้อความ
async function callGeminiAPI(userMessage) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: userMessage }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัย ฉันไม่สามารถตอบคำถามนี้ได้";
    return aiResponse;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "ขออภัยมีการ Request คำสั่งจากผู้ใช้งานมากเกินไปลองใหม่อีกครั้ง";
  }
}

// ฟังก์ชันเรียก Google AI Studio API (Gemini) แบบรูปภาพ
async function callGeminiAPIWithImage(imageBase64) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          { parts: [{ text: "โปรดวิเคราะห์รูปภาพนี้" }] },
          { parts: [{ inline_data: { mime_type: "image/jpeg", data: imageBase64 } }] }
        ],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัย ฉันไม่สามารถวิเคราะห์ภาพนี้ได้";
    return aiResponse;
  } catch (error) {
    console.error("Error calling Gemini API with image:", error);
    return "ขออภัย ฉันไม่สามารถวิเคราะห์ภาพนี้ได้ในขณะนี้";
  }
}

// ฟังก์ชันดาวน์โหลดรูปจาก LINE Server
async function getImageFromLine(messageId) {
  try {
    const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.LINE_ACCESS_TOKEN}` },
      responseType: "arraybuffer",
    });

    // แปลงรูปเป็น Base64
    const imageBase64 = Buffer.from(response.data, "binary").toString("base64");
    return imageBase64;
  } catch (error) {
    console.error("Error downloading image from LINE:", error);
    return null;
  }
}

// Webhook รับข้อความหรือรูปภาพจาก LINE
app.post("/webhook", async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message") {
      if (event.message.type === "text") {
        // 📌 ถ้าผู้ใช้ส่งข้อความ
        const userMessage = event.message.text;
        const aiResponse = await callGeminiAPI(userMessage);

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: aiResponse,
        });

      } else if (event.message.type === "image") {
        // 📌 ถ้าผู้ใช้ส่งรูปภาพ
        const imageBase64 = await getImageFromLine(event.message.id);
        if (!imageBase64) {
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: "ไม่สามารถดาวน์โหลดรูปภาพได้",
          });
          return;
        }

        const aiResponse = await callGeminiAPIWithImage(imageBase64);

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: aiResponse,
        });
      }
    }
  }
  res.sendStatus(200);
});

// Route ทดสอบเซิร์ฟเวอร์
app.get("/", (req, res) => {
  res.send("Hello, this is Line Bot with Gemini AI on Vercel!");
});

module.exports = app;
