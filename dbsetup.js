const mysql = require('mysql2');
const dbConfig = require('./config');
const connection = mysql.createConnection(dbConfig);

// Simple wrapper for connection.query to return a promise
const query = (sql, params) => {
    return new Promise((resolve, reject) => {
        connection.query(sql, params, (err, results) => {
            if (err) {
                return reject(err);
            }
            resolve(results);
        });
    });
};

const setupDatabase = async () => {
    try {
        // Connect to the database
        await new Promise((resolve, reject) => {
            connection.connect((error) => {
                if (error) {
                    reject('Error connecting to the database: ' + error.stack);
                } else {
                    console.log('Connected to the database as ID ' + connection.threadId);
                    resolve();
                }
            });
        });

        // Create database
        await query('CREATE DATABASE IF NOT EXISTS wpr2101040090');
        console.log('Database wpr2101040090 created or already exists');

        // Change to the new database
        await query('USE wpr2101040090');

        // Create users table
        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                fullName VARCHAR(255) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await query(createUsersTable);
        console.log('Users table created or already exists');

        // Create emails table
        const createEmailsTable = `
            CREATE TABLE IF NOT EXISTS emails (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                subject VARCHAR(255) NOT NULL,
                body TEXT NOT NULL,
                attachment VARCHAR(255),
                attachment_type VARCHAR(100),
                attachment_size INT,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sender_email_delete TIMESTAMP NULL,
                receiver_email_delete TIMESTAMP NULL,
                FOREIGN KEY (sender_id) REFERENCES users(id),
                FOREIGN KEY (receiver_id) REFERENCES users(id)

            )
        `;
        await query(createEmailsTable);
        console.log('Emails table created or already exists');
        
        // Insert initial data
        await insertInitialData();
    } catch (err) {
        console.error(err);
    } finally {
        connection.end();
    }
};

const insertInitialData = async () => {
    const users = [
        { fullName: "Anh A", email: "a@a.com", password: "123" },
        { fullName: "Anh B", email: "b@b.com", password: "111111" },
        { fullName: "Anh C", email: "c@c.com", password: "222222" }
    ];

    const emails = [
        { sender: "a@a.com", receiver: "b@b.com", subject: "Meeting Reminder", body: "Just a quick reminder about our meeting tomorrow at 10 AM. Please make sure to have your reports ready for discussion. Let’s aim to finalize the project timeline. Looking forward to everyone's input" },
        { sender: "b@b.com", receiver: "a@a.com", subject: "Quick Check-in", body: "I hope you’re doing well! I wanted to check in and see how the new project is going. Let me know if you need any assistance or if there’s anything I can help you with." },
        { sender: "c@c.com", receiver: "a@a.com", subject: "Feedback Request", body: "I’ve attached the draft of the presentation for your review. I would appreciate your feedback by the end of the day. Your insights are invaluable, and I want to make sure it’s polished before the meeting. Thanks!" },
        { sender: "a@a.com", receiver: "c@c.com", subject: "Team Outing Plans", body: "We’re planning a team outing next Friday! Please let me know if you can make it. It’ll be a great opportunity to unwind and bond outside of work. Looking forward to seeing everyone there!" },
        { sender: "b@b.com", receiver: "c@c.com", subject: "Project Update", body: "I wanted to provide a quick update on our current project. We are on track to meet our deadlines, but I need everyone’s continued effort to keep it moving smoothly. Let’s stay focused!" },
        { sender: "c@c.com", receiver: "b@b.com", subject: "Lunch Plans", body: "How about grabbing lunch next week? It’s been a while since we caught up. Let me know your availability, and I’ll make a reservation. Looking forward to chatting!" },
        { sender: "a@a.com", receiver: "b@b.com", subject: "Training Session", body: "We’ll be having a training session on Tuesday at 2 PM. Please ensure you attend, as it’s crucial for our upcoming project. If you have any topics you’d like covered, feel free to share." },
        { sender: "b@b.com", receiver: "a@a.com", subject: "Happy Birthday", body: "Wishing you a very happy birthday! May this year bring you joy and success in everything you do. Let’s celebrate soon! Enjoy your special day with friends and family." }
    ];
    
    // Insert users
    for (const user of users) {
        const insertUserQuery = 'INSERT IGNORE INTO users (fullName, email, password) VALUES (?, ?, ?)';
        await query(insertUserQuery, [user.fullName, user.email, user.password]);
    }

    // Insert emails
    for (const email of emails) {
        const insertEmailQuery = `
            INSERT INTO emails (sender_id, receiver_id, subject, body) 
            SELECT (SELECT id FROM users WHERE email = ?), 
                   (SELECT id FROM users WHERE email = ?), 
                   ?, ?`;
        await query(insertEmailQuery, [email.sender, email.receiver, email.subject, email.body]);
    }
};

// Run the setup
setupDatabase();