const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');
require('dotenv').config();
const app = express();
const port = 3000;

// Your API endpoint for sending emails
const apiUrl = process.env.API_URL; // Replace with your actual API URL

// Your email configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, // SMTP server (e.g., Gmail)
    port: process.env.SMTP_PORT, // For Gmail, use 587 (TLS) or 465 (SSL)
    secure: false, // Use true for 465, false for 587
    auth: {
        user: process.env.SMTP_USER, // Your email address
        pass: process.env.SMTP_PASS, // Your email password or app password
    },
});

// Global variable to store scraped emails
let scrapedEmails = [];

// Scrape LinkedIn and send a confirmation email
async function scrapeAndSendConfirmation() {
    console.log('Starting LinkedIn scraping job...');

    try {
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        // LinkedIn login credentials
        const email = process.env.LINKEDIN_EMAIL;
        const password = process.env.LINKEDIN_PASSWORD;

        // Login to LinkedIn
        console.log('Logging into LinkedIn...');
        await page.goto('https://www.linkedin.com/login');
        await page.type('#username', email);
        await page.type('#password', password);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        console.log('Successfully logged in!');

        // Navigate to LinkedIn posts search
        const searchUrl =
            'https://www.linkedin.com/search/results/content/?keywords=software%20developer&timeScope=1';
        console.log('Navigating to search page...');
        await page.goto(searchUrl);
        await page.waitForTimeout(5000); // Wait 5 seconds for the page to load

        // Wait for posts and scrape them
        console.log('Scraping posts...');
        await page.waitForSelector('div[data-urn*="urn:li:activity"]', { timeout: 60000 });

        const emails = [];
        let previousHeight = 0;
        const startTime = Date.now();
        const duration = 10 * 60 * 1000; // 10 minutes in milliseconds

        // Scroll for 10 minutes
        while (Date.now() - startTime < duration) {
            const posts = await page.$$('div[data-urn*="urn:li:activity"]');
            for (const post of posts) {
                try {
                    const postContent = await post.evaluate((el) => el.innerText);

                    // Extract email addresses using regex
                    const foundEmails = postContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                    if (foundEmails) emails.push(...foundEmails);
                } catch (err) {
                    console.error('Error extracting post details:', err);
                }
            }

            // Scroll down the page
            const currentHeight = await page.evaluate(() => document.body.scrollHeight);
            if (currentHeight === previousHeight) {
                console.log('No more posts to load.');
                break;
            }
            previousHeight = currentHeight;

            await page.evaluate(() => window.scrollBy(0, 1000)); // Scroll down 1000px
            await page.waitForTimeout(5000); // Wait 5 seconds for new content to load
        }

        // Remove duplicates
        scrapedEmails = [...new Set(emails)];
        console.log('Emails collected:', scrapedEmails);

        // Send confirmation email
        console.log('Sending confirmation email...');
        await transporter.sendMail({
            from: 'kalyancheruku56@gmail.com',
            to: 'kalyancheruku56@gmail.com',
            subject: 'Confirmation: Approve Email Sending',
            text: `We have collected the following emails:\n\n${scrapedEmails.join(
                '\n'
            )}\n\nClick the link below to approve sending these emails:\nhttp://localhost:${port}/confirm`,
        });

        console.log('Confirmation email sent.');
        await browser.close();
    } catch (err) {
        console.error('Error occurred during scraping:', err);
    }
}

// Confirm and send emails to recipients
app.get('/confirm', async (req, res) => {
    if (scrapedEmails.length === 0) {
        return res.status(400).send('No emails to send. Please try scraping again.');
    }

    try {
        console.log('Sending collected emails to API...');
        const response = await axios.post(apiUrl, {
            recipients: scrapedEmails,
        });

        console.log('Emails sent successfully:', response.data);
        res.send('Emails sent successfully!');
    } catch (err) {
        console.error('Error sending emails:', err);
        res.status(500).send('Failed to send emails.');
    }
});

// Schedule the job to run every day at 8 AM
// schedule.scheduleJob('0 8 * * *', () => {
//     console.log('Scheduled job started at 8 AM');
//     scrapeAndSendConfirmation();
// });
// Schedule the scraper to run every day at 7:30 PM
schedule.scheduleJob('54 19 * * *', () => {
    console.log('Running scheduled scraping job at 7:30 PM...');
    // scrapeLinkedIn('your-linkedin-email@example.com', 'your-linkedin-password');
    scrapeAndSendConfirmation();
});


// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
