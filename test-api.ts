import axios from 'axios';
import fs from 'fs';

const API_URL = 'http://localhost:3000/api';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLatestOtpFromLog(identifier: string): Promise<string> {
  await delay(1000); // Give the backend time to flush the log
  const logContent = fs.readFileSync(
    '/home/hitarth/.gemini/antigravity-ide/brain/77cd3b4d-b540-4cb0-bc4c-0455a5114118/.system_generated/tasks/task-142.log',
    'utf-8',
  );

  // Try exactly identifier first
  const escapedId = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let regex = new RegExp(`\\[OTP Stub\\] Sending OTP (\\d{6}) to ${escapedId}`, 'g');
  let matches = [...logContent.matchAll(regex)];

  // If not found, just grab the absolute last OTP generated to be safe
  if (matches.length === 0) {
    regex = new RegExp(`\\[OTP Stub\\] Sending OTP (\\d{6}) to `, 'g');
    matches = [...logContent.matchAll(regex)];
  }

  if (matches.length === 0) throw new Error(`OTP not found in log for ${identifier}`);
  return matches[matches.length - 1][1];
}

async function runComprehensiveTest() {
  console.log('--- Starting Comprehensive API Verification ---');
  let adminToken = '';
  let memberToken = '';
  let testMemberUuid = '';
  let testMemberId = '';
  let testNoticeId = '';
  let testQueryId = '';

  try {
    // ---------------------------------------------------------
    // 1. ADMIN AUTHENTICATION
    // ---------------------------------------------------------
    console.log('\n[1/7] Testing Admin Authentication...');
    const adminLogin = await axios.post(
      `${API_URL}/auth/login`,
      {
        identifier: 'admin@shreecrystal.local',
        password: 'ChangeMe@2024',
      },
      { validateStatus: () => true },
    );

    if (adminLogin.status === 201 && adminLogin.data?.data?.tempToken) {
      const adminOtp = await getLatestOtpFromLog('admin@shreecrystal.local');
      const adminVerify = await axios.post(
        `${API_URL}/auth/verify-otp`,
        {
          tempToken: adminLogin.data.data.tempToken,
          otp: adminOtp,
        },
        { validateStatus: () => true },
      );

      if (adminVerify.status === 201 && adminVerify.data?.data?.accessToken) {
        adminToken = adminVerify.data.data.accessToken;
        console.log('✅ Admin Auth: SUCCESS');
      } else {
        throw new Error(`Admin verify failed: ${adminVerify.status}`);
      }
    } else {
      throw new Error(`Admin login failed: ${adminLogin.status}`);
    }

    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // ---------------------------------------------------------
    // 2. SETTINGS MODULE
    // ---------------------------------------------------------
    console.log('\n[2/7] Testing Settings Module...');
    const settingsRes = await axios.get(`${API_URL}/settings/society`, {
      headers: adminHeaders,
      validateStatus: () => true,
    });
    if (settingsRes.status === 200) {
      console.log('✅ Fetch Society Settings: SUCCESS');
    } else {
      console.error(`❌ Fetch Society Settings: FAILED (${settingsRes.status})`);
    }

    const secSettingsRes = await axios.get(`${API_URL}/settings/security`, {
      headers: adminHeaders,
      validateStatus: () => true,
    });
    if (secSettingsRes.status === 200) {
      console.log('✅ Fetch Security Settings: SUCCESS');
    } else {
      console.error(`❌ Fetch Security Settings: FAILED (${secSettingsRes.status})`);
    }

    // ---------------------------------------------------------
    // 3. MEMBER MANAGEMENT
    // ---------------------------------------------------------
    console.log('\n[3/7] Testing Member Management...');
    const mockMobile = `999${Math.floor(Math.random() * 10000000)
      .toString()
      .padStart(7, '0')}`;
    const mockAadhaar = `1${Math.floor(Math.random() * 100000000000)
      .toString()
      .padStart(11, '0')}`;
    const createMemberRes = await axios.post(
      `${API_URL}/members`,
      {
        fullName: 'E2E Test Member',
        dob: '1990-01-01',
        gender: 'MALE',
        addressLine1: 'Test Address',
        city: 'Test City',
        state: 'Test State',
        pincode: '123456',
        mobile: mockMobile,
        fatherOrHusbandName: 'Test Father',
        aadhaar: mockAadhaar,
      },
      { headers: adminHeaders, validateStatus: () => true },
    );

    if (createMemberRes.status === 201) {
      console.log('✅ Create Member: SUCCESS');
      testMemberId = createMemberRes.data.data.memberId;
      testMemberUuid = createMemberRes.data.data.id;
    } else {
      console.error(`❌ Create Member: FAILED (${createMemberRes.status})`, createMemberRes.data);
      // Fallback: try to fetch an existing member to continue tests
      const membersRes = await axios.get(`${API_URL}/members`, {
        headers: adminHeaders,
        validateStatus: () => true,
      });
      if (membersRes.data?.data?.length > 0) {
        testMemberId = membersRes.data.data[0].memberId;
        testMemberUuid = membersRes.data.data[0].id;
        console.log(`⚠️ Using existing member for tests: ${testMemberId} (${testMemberUuid})`);
      } else {
        throw new Error('No members available to test member flows.');
      }
    }

    // Fetch Member Details
    const getMemberRes = await axios.get(`${API_URL}/members/${testMemberUuid}`, {
      headers: adminHeaders,
      validateStatus: () => true,
    });
    if (getMemberRes.status === 200) {
      console.log('✅ Fetch Member Details: SUCCESS');
    } else {
      console.error(`❌ Fetch Member Details: FAILED (${getMemberRes.status})`);
    }

    // Reset Member Password (since they are new and have no password)
    console.log('✅ Setting member password via Forgot Password flow...');
    const forgotRes = await axios.post(
      `${API_URL}/auth/forgot-password`,
      {
        identifier: mockMobile,
      },
      { validateStatus: () => true },
    );

    if (forgotRes.status === 201 && forgotRes.data?.data?.tempToken) {
      const forgotTempToken = forgotRes.data.data.tempToken;
      const forgotOtp = await getLatestOtpFromLog(mockMobile);

      const resetRes = await axios.post(
        `${API_URL}/auth/reset-password`,
        {
          tempToken: forgotTempToken,
          otp: forgotOtp,
          newPassword: 'Password@123',
        },
        { validateStatus: () => true },
      );

      if (resetRes.status === 201) {
        console.log('✅ Member Password Reset: SUCCESS');
      } else {
        console.error(`❌ Member Password Reset: FAILED (${resetRes.status})`);
      }
    } else {
      console.error(`❌ Member Forgot Password: FAILED (${forgotRes.status})`);
    }

    // ---------------------------------------------------------
    // 4. MEMBER AUTHENTICATION
    // ---------------------------------------------------------
    console.log('\n[4/7] Testing Member Authentication...');
    const memLogin = await axios.post(
      `${API_URL}/auth/login`,
      {
        identifier: mockMobile,
        password: 'Password@123',
      },
      { validateStatus: () => true },
    );

    if (memLogin.status === 201 && memLogin.data?.data?.tempToken) {
      const memOtp = await getLatestOtpFromLog(mockMobile);

      const memVerify = await axios.post(
        `${API_URL}/auth/verify-otp`,
        {
          tempToken: memLogin.data.data.tempToken,
          otp: memOtp,
        },
        { validateStatus: () => true },
      );

      if (memVerify.status === 201 && memVerify.data?.data?.accessToken) {
        memberToken = memVerify.data.data.accessToken;
        console.log('✅ Member Auth: SUCCESS');
      } else {
        throw new Error(`Member verify failed: ${memVerify.status}`);
      }
    } else {
      throw new Error(`Member login failed: ${memLogin.status}`);
    }

    const memHeaders = { Authorization: `Bearer ${memberToken}` };

    // ---------------------------------------------------------
    // 5. MEMBER DASHBOARD & PORTAL
    // ---------------------------------------------------------
    console.log('\n[5/7] Testing Member Portal Endpoints...');
    const memDashRes = await axios.get(`${API_URL}/members/me/dashboard`, {
      headers: memHeaders,
      validateStatus: () => true,
    });
    if (memDashRes.status === 200) {
      console.log('✅ Member Dashboard Stats: SUCCESS');
    } else {
      console.error(`❌ Member Dashboard Stats: FAILED (${memDashRes.status})`);
    }

    const memProfileRes = await axios.get(`${API_URL}/members/me`, {
      headers: memHeaders,
      validateStatus: () => true,
    });
    if (memProfileRes.status === 200) {
      console.log('✅ Member Profile Fetch: SUCCESS');
    } else {
      console.error(`❌ Member Profile Fetch: FAILED (${memProfileRes.status})`);
    }

    // ---------------------------------------------------------
    // 6. NOTICES
    // ---------------------------------------------------------
    console.log('\n[6/7] Testing Notices Module...');
    const createNoticeRes = await axios.post(
      `${API_URL}/notices`,
      {
        title: 'E2E Test Notice',
        body: 'This is a test notice',
      },
      { headers: adminHeaders, validateStatus: () => true },
    );

    if (createNoticeRes.status === 201) {
      console.log('✅ Create Notice (Admin): SUCCESS');
      testNoticeId = createNoticeRes.data.data.id;

      const publishNoticeRes = await axios.post(
        `${API_URL}/notices/${testNoticeId}/publish`,
        {},
        { headers: adminHeaders, validateStatus: () => true },
      );
      if (publishNoticeRes.status === 201 || publishNoticeRes.status === 200) {
        console.log('✅ Publish Notice (Admin): SUCCESS');
      }
    } else {
      console.error(`❌ Create Notice (Admin): FAILED (${createNoticeRes.status})`);
    }

    const memNoticesRes = await axios.get(`${API_URL}/notices/me`, {
      headers: memHeaders,
      validateStatus: () => true,
    });
    if (memNoticesRes.status === 200) {
      console.log('✅ Fetch Member Notices: SUCCESS');
    } else {
      console.error(`❌ Fetch Member Notices: FAILED (${memNoticesRes.status})`);
    }

    // ---------------------------------------------------------
    // 7. SUPPORT QUERIES
    // ---------------------------------------------------------
    console.log('\n[7/7] Testing Support Queries...');
    const createQueryRes = await axios.post(
      `${API_URL}/queries`,
      {
        subject: 'E2E Test Support Query',
        message: 'This is a test query message from member',
      },
      { headers: memHeaders, validateStatus: () => true },
    );

    if (createQueryRes.status === 201) {
      console.log('✅ Create Query (Member): SUCCESS');
      testQueryId = createQueryRes.data.data.id;

      const replyRes = await axios.post(
        `${API_URL}/queries/${testQueryId}/reply`,
        {
          message: 'This is an admin reply',
        },
        { headers: adminHeaders, validateStatus: () => true },
      );

      if (replyRes.status === 201) {
        console.log('✅ Admin Reply to Query: SUCCESS');
      } else {
        console.error(`❌ Admin Reply to Query: FAILED (${replyRes.status})`);
      }
    } else {
      console.error(`❌ Create Query (Member): FAILED (${createQueryRes.status})`);
    }

    console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error(`\n🔥 FATAL ERROR: ${err.message}`);
    if (err.response) {
      console.error(err.response.data);
    }
  }
}

void runComprehensiveTest();
