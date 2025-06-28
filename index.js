// line-bot-vyw-gemini.js (วิว เวอร์ชันสร้างภาพได้)

const express = require("express");
const { Client } = require("@line/bot-sdk");
const axios = require("axios");
// *** NEW: นำเข้าเครื่องมือสร้างภาพ ***
const { image_generation } = require("./api_definitions"); // สมมติว่า tool อยู่ในไฟล์นี้
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_SECRET,
};

const client = new Client(config);
app.use(express.json());

const userContext = {};

// --- START: NEW Image Generation Feature ---

/**
 * ฟังก์ชันสำหรับเรียก Image Generation API
 * @param {string} prompt คำอธิบายภาพที่ต้องการสร้าง
 * @returns {string | null} trả về content_id ของภาพ หรือ null ถ้าสร้างไม่สำเร็จ
 */
async function generateImageFromPrompt(prompt) {
  console.log(`Generating image for prompt: "${prompt}"`);
  try {
    // เรียกใช้ image_generation tool
    const imageResult = await image_generation.generate_images({
      prompts: [prompt],
      image_generation_usecase: image_generation.ImageGenerationUsecase.ALTERNATIVES,
    });

    // ตรวจสอบผลลัพธ์
    const contentId = imageResult?.results?.[0]?.content_id;
    const generatedImages = imageResult?.results?.[0]?.generated_images;

    if (contentId && generatedImages && generatedImages.length > 0) {
      console.log(`Image generated successfully. Content ID: ${contentId}`);
      return contentId; // ส่งคืน ID ของภาพที่สร้างได้สำเร็จ
    } else {
      console.error("Image generation failed. No image returned from API.");
      return null;
    }
  } catch (error) {
    console.error("Error calling Image Generation API:", error);
    return null;
  }
}

// --- END: NEW Image Generation Feature ---


async function callGeminiVisionAPI(prompt, imageBase64) {
  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
        ],
      }],
    };
    const response = await axios.post(apiUrl, requestBody, { headers: { "Content-Type": "application/json" } });
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "อ๊ะ วิวยังวิเคราะห์ภาพนี้ไม่ได้เลย ลองใหม่นะคะ 😜";
  } catch (error) {
    console.error("Error calling Gemini Vision API:", error.response?.data || error.message);
    return "วิวขอโทษนะคะ ตอนนี้ยังวิเคราะห์ภาพนี้ไม่ได้ ลองใหม่อีกทีนะคะ 💛";
  }
}

async function callGeminiAPI(userMessage) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: userMessage }] }] },
      { headers: { "Content-Type": "application/json" } }
    );
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "อ๊ะ วิวยังตอบเรื่องนี้ไม่ได้เลย ลองถามใหม่นะคะ 😜";
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
    return Buffer.from(response.data, "binary").toString("base64");
  } catch (error) {
    console.error("Error downloading image from LINE:", error);
    return null;
  }
}

app.post("/webhook", async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message") {
      const userId = event.source.userId;

      if (event.message.type === "text") {
        const userMessage = event.message.text;

        // --- START: Webhook Logic for Image Generation ---
        const imageCommand = "วาดรูป";
        if (userMessage.trim().startsWith(imageCommand)) {
          // ถ้าข้อความขึ้นต้นด้วย "วาดรูป"
          const prompt = userMessage.substring(imageCommand.length).trim();

          if (!prompt) {
            // กรณีพิมพ์ "วาดรูป" เฉยๆ ไม่มี prompt
            await client.replyMessage(event.replyToken, {
              type: "text",
              text: "ได้เลยค่ะ! อยากให้วิววาดรูปอะไรดีคะ? ลองพิมพ์ 'วาดรูป' ตามด้วยคำอธิบายภาพได้เลยค่ะ ☺"
            });
            continue; // ไปยัง event ถัดไป
          }

          // ส่งข้อความตอบกลับเบื้องต้น เพื่อให้ผู้ใช้รู้ว่ากำลังทำงาน
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: `รับทราบค่ะ! วิวกำลังวาดภาพ "${prompt}" ให้อยู่นะคะ รอสักครู่น้า... 🎨`
          });

          // เรียกฟังก์ชันสร้างภาพ
          const imageId = await generateImageFromPrompt(prompt);

          if (imageId) {
            // ถ้าสร้างภาพสำเร็จ ให้ส่งภาพกลับไปหาผู้ใช้
            // โดยการ push message ไป เพราะเราได้ reply ไปแล้วในตอนแรก
            await client.pushMessage(userId, {
              type: "text",
              text: imageId // ส่ง content_id เป็นข้อความธรรมดา
            });
          } else {
            // ถ้าสร้างภาพไม่สำเร็จ
            await client.pushMessage(userId, {
              type: "text",
              text: "ขออภัยค่ะ วิวไม่สามารถสร้างภาพนี้ได้ในตอนนี้ ลองเปลี่ยนคำอธิบายหรือลองใหม่อีกครั้งนะคะ"
            });
          }

        } else {
          // --- END: Webhook Logic for Image Generation ---

          // ถ้าไม่ใช่คำสั่งวาดรูป ก็เข้าสู่ logic การถาม-ตอบปกติ
          userContext[userId] = { text: userMessage, timestamp: Date.now() };
          const aiResponse = await callGeminiAPI(userMessage);
          await client.replyMessage(event.replyToken, { type: "text", text: aiResponse });
        }
      } else if (event.message.type === "image") {
        // Logic การวิเคราะห์รูปภาพยังคงเดิม
        const imageBase64 = await getImageFromLine(event.message.id);
        if (!imageBase64) {
          await client.replyMessage(event.replyToken, { type: "text", text: "อ๊ะ วิวยังโหลดรูปนี้ไม่ได้ ลองส่งใหม่อีกทีนะคะ 😜" });
          return;
        }
        let prompt = "วิวช่วยวิเคราะห์รูปนี้ให้หน่อยนะคะ 💛";
        if (userContext[userId]) {
          prompt = userContext[userId].text;
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
  res.send("สวัสดีค่า วิวเองนะคะ 💛 บอทพร้อมช่วยตอบ, วิเคราะห์ภาพ, และวาดภาพให้แล้วค่ะ!");
});

module.exports = app;