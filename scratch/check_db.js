const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

function encrypt(text) {
  const key = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${enc}:${tag}`;
}

async function main() {
  const prisma = new PrismaClient();
  let member = await prisma.member.findFirst();
  if (!member) {
    member = await prisma.member.create({
      data: {
        memberId: 'SCC-00002',
        fullName: 'Test Member',
        dob: new Date('1990-01-01'),
        gender: 'MALE',
        addressLine1: 'Test Address',
        city: 'Pune',
        state: 'MH',
        pincode: '411001',
        mobile: '9876543210',
        aadhaarHash: 'fake_hash',
        aadhaarEncrypted: encrypt('123456789012'),
        panEncrypted: encrypt('ABCDE1234F'),
        status: 'ACTIVE'
      }
    });
  }

  const raw = await prisma.$queryRawUnsafe('SELECT aadhaar_encrypted, pan_encrypted FROM members LIMIT 1;');
  console.log("RAW DB:", raw);
  await prisma.$disconnect();
}
main().catch(console.error);
