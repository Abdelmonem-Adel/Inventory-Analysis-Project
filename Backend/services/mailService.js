import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

export const sendDailyReportEmail = async (excelPath, imagePath, dateString, piecesImagePath, expiryAlerts = []) => {
    const { EMAIL_USER, EMAIL_PASS, EMAIL_TO } = process.env;

    if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_TO) {
        console.error(`[mailService] Email configuration is missing in .env`);
        return false;
    }

    // Support multiple recipients separated by comma in .env
    const recipients = EMAIL_TO.split(',').map(email => email.trim());
    console.log(`[mailService] Preparing to send email to: ${recipients.join(', ')}`);

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Use STARTTLS on port 587
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false // Fix self-signed certificate errors in some environments
        }
    });

    const excelUrl = `https://yourdomain.com/reports/${dateString}`;
    const dashboardUrl = `https://breadfastwh.online`;

    // Generate Expiry Alerts HTML
    let expiryHtml = '';
    if (expiryAlerts && expiryAlerts.length > 0) {
        expiryHtml = `
      <div style="margin-top:40px; padding:20px; background:#fff1f2; border-radius:10px; border:1px solid #fda4af;">
        <h2 style="color:#9f1239; margin-top:0;">⚠️ Critical Expiry Alerts</h2>
        <p style="color:#be123c;">The following items have expired or are nearing expiry. Please take action immediately.</p>
        <table style="width:100%; border-collapse: collapse; margin-top:15px; background:white; border-radius:8px; overflow:hidden;">
          <thead>
            <tr style="background:#fb7185; color:white; text-align:left;">
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Product</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Location</th>
              <th style="padding:10px; border-bottom:1px solid #e2e8f0;">Expiry Date</th>
            </tr>
          </thead>
          <tbody>
            ${expiryAlerts.map(item => `
              <tr>
                <td style="padding:10px; border-bottom:1px solid #f1f5f9;">${item.productName} <br><small style="color:#64748b;">ID: ${item.productId}</small></td>
                <td style="padding:10px; border-bottom:1px solid #f1f5f9;">${item.location}</td>
                <td style="padding:10px; border-bottom:1px solid #f1f5f9; color:#e11d48; font-weight:bold;">${new Date(item.expiryDate).toLocaleDateString('en-GB')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
        `;
    }

    // 1. Prepare Attachments
    const attachments = [
        {
            filename: 'logo.png',
            path: path.join(process.cwd(), '../Frontend/Image/BreadFast Logo.png'),
            cid: 'companyLogo'
        }
    ];

    if (excelPath) {
        attachments.push({
            filename: path.basename(excelPath),
            path: excelPath
        });
    }

    if (imagePath) {
        attachments.push({
            filename: path.basename(imagePath),
            path: imagePath,
            cid: 'dailyChartItems'
        });
    }

    if (piecesImagePath) {
        attachments.push({
            filename: path.basename(piecesImagePath),
            path: piecesImagePath,
            cid: 'dailyChartPieces'
        });
    }

    // 2. Prepare HTML Sections
    let itemsChartHtml = '';
    if (imagePath) {
        itemsChartHtml = `
      <!-- SECTION 1 -->
      <div style="margin-top:30px;">
        <h2 style="color:#0f172a;">📊 Item Summary</h2>
        <p style="color:#64748b;">
          This chart shows the total number of items per category.
        </p>
        <img src="cid:dailyChartItems" 
             style="width:100%; border-radius:8px; border:1px solid #e2e8f0; margin-top:10px;" />
      </div>`;
    }

    let piecesChartHtml = '';
    if (piecesImagePath) {
        piecesChartHtml = `
      <!-- SECTION 2 -->
      <div style="margin-top:40px;">
        <h2 style="color:#0f172a;">📦 Quantity Summary</h2>
        <p style="color:#64748b;">
          This chart shows the total quantity of pieces per category.
        </p>
        <img src="cid:dailyChartPieces" 
             style="width:100%; border-radius:8px; border:1px solid #e2e8f0; margin-top:10px;" />
      </div>`;
    }

    const mailOptions = {
        from: EMAIL_USER,
        to: recipients, // NodeMailer supports an array of emails
        subject: `Daily Scan Report: ${dateString}`,
       html: `
<div style="font-family: Arial, Helvetica, sans-serif; background:#f4f6f8; padding:30px;">
  <div style="max-width:700px; margin:auto; background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.08);">
    
    <!-- HEADER -->
    <div style="background:#0f172a; padding:20px; text-align:center;">
      <img src="cid:companyLogo" style="height:60px; margin-bottom:10px;" />
      <h1 style="color:#ffffff; margin:0;">Daily Inventory Report</h1>
      <p style="color:#cbd5e1; margin:5px 0 0;">${dateString}</p>
    </div>

    <!-- BODY -->
    <div style="padding:30px; color:#334155;">

      <p style="font-size:16px;">
        Hello,
        <br><br>
        Please find below the latest <strong>Inventory Scan Report</strong>.
        ${excelPath ? 'You can download the detailed Excel report or view the dashboard from the buttons below.' : 'View the dashboard from the button below.'}
      </p>

      <!-- EXPIRY ALERTS -->
      ${expiryHtml}

      <!-- ACTION BUTTONS -->
      <div style="text-align:center; margin:30px 0;">

        <a href="${dashboardUrl}"
           style="
             display:inline-block;
             background:#2563eb;
             color:white;
             padding:14px 26px;
             margin:10px;
             border-radius:8px;
             text-decoration:none;
             font-weight:bold;
             font-size:15px;
             box-shadow:0 4px 10px rgba(0,0,0,0.15);
           ">
           📊 View Dashboard
        </a>

      </div>

      ${itemsChartHtml}

      ${piecesChartHtml}

    </div>

    <!-- FOOTER -->
    <div style="background:#f1f5f9; padding:20px; text-align:center; font-size:13px; color:#64748b;">
      <p style="margin:0;">
        This is an automated email from the Inventory Management System.
      </p>
      <p style="margin:5px 0 0;">
        Please do not reply to this email.
      </p>
    </div>

  </div>
</div>
`,
        attachments: attachments
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[mailService] Email successfully sent to: ${recipients.join(', ')}`);

        // Delete temp files after sending
        try {
            if (excelPath && fs.existsSync(excelPath)) fs.unlinkSync(excelPath);
            if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            if (piecesImagePath && fs.existsSync(piecesImagePath)) fs.unlinkSync(piecesImagePath);
            console.log(`[mailService] Cleaned up temporary report files.`);
        } catch (cleanupErr) {
            console.error(`[mailService] Error cleaning up temporary files: `, cleanupErr.message);
        }

        return true;
    } catch (error) {
        console.error(`[mailService] Error sending email: `, error.message);
        throw error;
    }
};
