// line-bot-vyw-gemini.js (วิว เวอร์ชันสมบูรณ์ Gemini 2.5 Flash)

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

async function callGeminiAPI(userMessage) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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

async function callGeminiAPIWithImage(imageBase64) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          { parts: [{ text: "วิวช่วยวิเคราะห์รูปนี้ให้หน่อยนะคะ 💛" }] },
          { parts: [{ inline_data: { mime_type: "image/jpeg", data: imageBase64 } }] },
        ],
      },
      { headers: { "Content-Type": "application/json" } }
    );
    const aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "อ๊ะ วิวยังวิเคราะห์ภาพนี้ไม่ได้เลย ลองใหม่นะคะ 😜";
    return aiResponse;
  } catch (error) {
    console.error("Error calling Gemini API with image:", error);
    return "วิวขอโทษนะคะ ตอนนี้ยังวิเคราะห์ภาพนี้ไม่ได้ ลองใหม่อีกทีนะคะ 💛";
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
      if (event.message.type === "text") {
        const userMessage = event.message.text;
        const aiResponse = await callGeminiAPI(userMessage);
        await client.replyMessage(event.replyToken, { type: "text", text: aiResponse });
      } else if (event.message.type === "image") {
        const imageBase64 = await getImageFromLine(event.message.id);
        if (!imageBase64) {
          await client.replyMessage(event.replyToken, { type: "text", text: "อ๊ะ วิวยังโหลดรูปนี้ไม่ได้ ลองส่งใหม่อีกทีนะคะ 😜" });
          return;
        }
        const aiResponse = await callGeminiAPIWithImage(imageBase64);
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