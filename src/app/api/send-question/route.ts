/**
 * src/app/api/send-question/route.ts
 * API route for sending contact form emails
 * Receives form submissions from the public lot page and sends emails
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST handler for contact form submissions
 * Sends an email notification to info@bensonestatesales.com
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      lot_number,
      lot_name,
      sale_id,
      customer_name,
      customer_email,
      message,
    } = body;

    // Validate required fields
    if (
      !lot_number ||
      !lot_name ||
      !customer_name ||
      !customer_email ||
      !message
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // TODO: Implement email sending
    // You have several options:
    // 1. Resend (resend.com) - Recommended, free tier available
    // 2. SendGrid (sendgrid.com)
    // 3. Mailgun (mailgun.com)
    // 4. AWS SES
    // 5. Nodemailer with your own email server

    // For now, we'll implement Resend as an example
    // Install: npm install resend
    // Set env var: RESEND_API_KEY=your_api_key

    const emailContent = `
New Question About Item

Lot #${lot_number}: ${lot_name}
Sale ID: ${sale_id}

From: ${customer_name}
Email: ${customer_email}

Message:
${message}

---
This message was sent via your Benson Estate Sales website.
Reply to: ${customer_email}
    `;

    // Option 1: Using Resend (recommended)
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        const response = await resend.emails.send({
          from: 'noreply@bensonestatesales.com',
          to: 'info@bensonestatesales.com',
          subject: `Question About Item #${lot_number}: ${lot_name}`,
          html: `
            <h2>New Question from Customer</h2>
            <p><strong>Item:</strong> #${lot_number} - ${lot_name}</p>
            <p><strong>From:</strong> ${customer_name}</p>
            <p><strong>Email:</strong> <a href="mailto:${customer_email}">${customer_email}</a></p>
            <hr style="margin: 20px 0;" />
            <p><strong>Message:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
            <hr style="margin: 20px 0;" />
            <p style="color: #666; font-size: 12px;">
              Reply directly to ${customer_email}
            </p>
          `,
          replyTo: customer_email,
        });

        if (response.error) {
          console.error('Resend error:', response.error);
          return NextResponse.json(
            { error: 'Failed to send email' },
            { status: 500 }
          );
        }

        return NextResponse.json({ success: true });
      } catch (error) {
        console.error('Resend error:', error);
        return NextResponse.json(
          { error: 'Failed to send email' },
          { status: 500 }
        );
      }
    }

    // Option 2: Using SendGrid
    if (process.env.SENDGRID_API_KEY) {
      try {
        const sgMail = (await import('@sendgrid/mail')).default;
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        await sgMail.send({
          to: 'info@bensonestatesales.com',
          from: 'noreply@bensonestatesales.com',
          subject: `Question About Item #${lot_number}: ${lot_name}`,
          html: `
            <h2>New Question from Customer</h2>
            <p><strong>Item:</strong> #${lot_number} - ${lot_name}</p>
            <p><strong>From:</strong> ${customer_name}</p>
            <p><strong>Email:</strong> <a href="mailto:${customer_email}">${customer_email}</a></p>
            <hr style="margin: 20px 0;" />
            <p><strong>Message:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
          `,
          replyTo: customer_email,
        });

        return NextResponse.json({ success: true });
      } catch (error) {
        console.error('SendGrid error:', error);
        return NextResponse.json(
          { error: 'Failed to send email' },
          { status: 500 }
        );
      }
    }

    // Option 3: Fallback - Log to console (for development)
    console.log('Question received (no email service configured):');
    console.log(emailContent);

    // In production, you should have an email service configured
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    // In development, pretend we sent it
    return NextResponse.json({
      success: true,
      message: 'Email logged to console (no service configured)',
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Setup instructions for email:
 *
 * Choose one of the email services below and set up the API key:
 *
 * OPTION 1: Resend (Recommended - easiest setup)
 * 1. Go to resend.com
 * 2. Sign up for free account
 * 3. Get your API key
 * 4. Add to .env.local: RESEND_API_KEY=your_key
 * 5. npm install resend
 *
 * OPTION 2: SendGrid
 * 1. Go to sendgrid.com
 * 2. Create account
 * 3. Get API key
 * 4. Add to .env.local: SENDGRID_API_KEY=your_key
 * 5. npm install @sendgrid/mail
 *
 * OPTION 3: Gmail (Via Nodemailer)
 * 1. Create app password in Gmail
 * 2. Use with Nodemailer
 * 3. npm install nodemailer
 */