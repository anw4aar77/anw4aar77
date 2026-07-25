const express = require('express');
const app = express();
const cors = require('cors');
const fs = require('fs'); // استيراد مكتبة التعامل مع الملفات
const path = require('path');

app.use(cors());

// استيراد الـ Self-bot لنسخ السيرفرات
const { Client: Client2 } = require('discord.js-selfbot-v13');
// استيراد البوت الرسمي لإرسال الإشعارات
const { Client: BotClient, GatewayIntentBits, PermissionsBitField } = require('discord.js');

app.use(express.json());
app.use(express.static(__dirname));

// توكن البوت الرسمي لإرسال الإشعارات
const BOT_TOKEN = "MTQxMDA2MTA5NTgyOTI0NTk4Mw.Gxtvj4.OoiA-v1PQK6Cbrwn28AVIEYZjmZ19hhZcvQYJ4";

const bot = new BotClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages
    ]
});

bot.once('ready', () => {
    console.log(`Bot logged in as ${bot.user.tag}`);
});

bot.login(BOT_TOKEN);

// دالة لحفظ بيانات المستخدمين في ملف نصي
function saveClientLog(userId, sourceId, targetId) {
    const timestamp = new Date().toLocaleString();
    const logData = `[${timestamp}] | User ID: ${userId} | Source Server: ${sourceId} | Target Server: ${targetId}\n--------------------------------------------------\n`;
    
    // حفظ الملف باسم clients_log.txt (غادي يتصاوب أوتوماتيكياً في نفس المجلد)
    fs.appendFile(path.join(__dirname, 'clients_log.txt'), logData, (err) => {
        if (err) console.error("خطأ في حفظ السجل:", err);
    });
}

// دالة النسخ الأساسية مع دمج البوت لإرسال الـ DM لصاحب الطلب
async function cloneServer(token, id, id2, userId) {
    // حفظ البيانات في الملف بمجرد الضغط والبدء
    saveClientLog(userId, id, id2);

    const client2 = new Client2({ checkUpdate: false });
    await client2.login(token);
    
    const guild = client2.guilds.cache.get(id);
    const guild2 = client2.guilds.cache.get(id2);
    
    if (!guild || !guild2) throw new Error("السيرفرات غير موجودة أو التوكن غير صالح");
    
    if (guild.id === guild2.id || !guild2.members.me.permissions.has(PermissionsBitField.Flags.Administrator)) {
        throw new Error("لا يمكن نسخ السيرفر (تأكد أن الحساب بداخل السيرفرين وأن لديه صلاحيات المسؤول)");
    }

    // دالة إرسال الإشعار عبر البوت الرسمي للـ User اللي دار الطلب
    async function sendUserDm(text) {
        if (!userId) return;
        try {
            const user = await bot.users.fetch(userId);
            if (user) {
                await user.send(text);
            }
        } catch (err) {
            console.log("لم يتمكن البوت من إرسال DM للمستخدم:", err.message);
        }
    }

    // 1. مسح القنوات القديمة
    for (const [, channel] of guild2.channels.cache) {
        await channel.delete().catch(() => {});
    }

    // 2. مسح الرولات القديمة
    for (const [, role] of guild2.roles.cache) {
        await role.delete().catch(() => {});
    }

    // 3. مسح الايموجيات القديمة
    for (const [, emoji] of guild2.emojis.cache) {
        await emoji.delete().catch(() => {});
    }

    const roles = new Map();
    const categories = new Map();

    const guildRoles = [...guild.roles.cache.values()].sort((a, b) => a.rawPosition - b.rawPosition);
    const guildCategories = [...guild.channels.cache.filter((channel) => channel.type === 'GUILD_CATEGORY').values()].sort((a, b) => a.rawPosition - b.rawPosition);
    const guildChannels = [...guild.channels.cache.filter((channel) => channel.type !== 'GUILD_CATEGORY').values()].sort((a, b) => a.rawPosition - b.rawPosition);

    // 4. إنشاء الرولات
    for (const role of guildRoles) {
        try {
            if (role.id === guild.roles.everyone.id) {
                await guild2.roles.everyone.setPermissions(role.permissions.toArray());
                roles.set(role.id, guild2.roles.everyone);
                continue;
            }
            const createdRole = await guild2.roles.create({
                name: role.name,
                position: role.rawPosition,
                colors: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable,
                permissions: role.permissions.toArray(),
            });
            roles.set(role.id, createdRole);
        } catch (e) {
            console.error(`خطأ في إنشاء رول: ${role.name}`);
        }
    }
    await sendUserDm("✅ تم الانتهاء من نسخ وعمل **Roles (الرولات)** بنجاح!");

    // 5. إنشاء الكاتجوري
    for (const category of guildCategories) {
        try {
            const permissionOverwrites = [];
            for (const [, overwrite] of category.permissionOverwrites.cache) {
                const role = roles.get(overwrite.id);
                if (role) {
                    permissionOverwrites.push({
                        id: role.id,
                        allow: overwrite.allow.toArray(),
                        deny: overwrite.deny.toArray()
                    });
                }
            }
            const createdCategory = await guild2.channels.create(category.name, {
                type: 'GUILD_CATEGORY',
                permissionOverwrites
            });
            categories.set(category.id, createdCategory);
        } catch (e) {
            console.error(`خطأ في إنشاء الكاتجوري: ${category.name}`);
        }
    }
    await sendUserDm("✅ تم الانتهاء من نسخ وعمل **Categories (الأقسام)** بنجاح!");

    // 6. إنشاء القنوات
    for (const channel of guildChannels) {
        try {
            const permissionOverwrites = [];
            const type = channel.type === 'GUILD_TEXT' ? 'GUILD_TEXT' : 'GUILD_VOICE' ? 'GUILD_VOICE' : 'GUILD_TEXT';
            const parent = channel.parentId ? categories.get(channel.parentId) : null;

            for (const [, overwrite] of channel.permissionOverwrites.cache) {
                const role = roles.get(overwrite.id);
                if (role) {
                    permissionOverwrites.push({
                        id: role.id,
                        allow: overwrite.allow.toArray(),
                        deny: overwrite.deny.toArray()
                    });
                }
            }
            await guild2.channels.create(channel.name, {
                type,
                permissionOverwrites,
                parent
            });
        } catch (e) {
            console.error(`خطأ في إنشاء القناة: ${channel.name}`);
        }
    }
    await sendUserDm("✅ تم الانتهاء من نسخ وعمل **Channels (القنوات)** بنجاح!");

    // 7. نسخ الايموجي
    for (const [, emoji] of guild.emojis.cache) {
        try {
            await guild2.emojis.create(emoji.url, emoji.name);
        } catch (e) {}
    }
    await sendUserDm("✅ تم الانتهاء من نسخ وعمل **Emojis (الإيموجيات)** بنجاح!");

    return "تم نسخ السيرفر بنجاح تام!";
}

// --- API لربط الموقع بالسيرفر ---
app.post('/api/copy', async (req, res) => {
    const { token, id, id2, userId } = req.body;
    if (!token || !id || !id2 || !userId) {
        return res.json({ message: "المرجو تعبئة جميع الخانات بما فيها User ID!" });
    }

    try {
        console.log(`بدء عملية النسخ للمستخدم: ${userId} | من ${id} إلى ${id2}`);
        const result = await cloneServer(token, id, id2, userId);
        res.json({ message: result });
    } catch (error) {
        console.error(error);
        res.json({ message: "خطأ: " + error.message });
    }
});

// تشغيل السيرفر
app.listen(3000, () => console.log('Cloner Server running on port 3000'));