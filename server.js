const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const dbConfig = require('./config'); // Adjust to the correct path where your db.js is located
const app = express();
const PORT = 8000;
const mysql = require('mysql2');
const path = require('path');

//MiddleWare
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.json());

const uploads_dir = path.join(__dirname, 'uploads');

// Create a connection 
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

// Define storage settings for Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploads_dir); // Use the uploads directory
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // Limit to 5 MB
});

// Redirect root URL to /signin
app.get('/', (req, res) => {
    res.redirect('/signin');
});

// GET route for the sign-in page
app.get('/signin', (req, res) => {
    res.render('signin', { error: null,}); // Pass the link variable here
});

// POST route to handle login form submission
app.post('/signin', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await query(`SELECT * FROM users WHERE email = ?`, [username]);
        if (result.length > 0 && password === result[0].password) {
            // Set cookies with username and password
            res.cookie('username', username, { maxAge: 4800000, httpOnly: true });
            res.cookie('password', password, { maxAge: 4800000, httpOnly: true });
            res.redirect('/inbox'); // Redirect to inbox upon successful login
        } else {
            res.render('signin', { error: 'Invalid username or password' });
        }
    } catch (error) {
        res.render('signin', { error: 'Database error' });
    }
});

// Middleware for user authentication
function authenticateUser(req, res, next) {
    const uname = req.cookies['username'];
    const pword = req.cookies['password'];

    if (uname && pword) {
        query(`SELECT * FROM users WHERE email = ?`, [uname])
            .then(result => {
                if (result.length > 0 && pword === result[0].password) {
                    req.user = result[0]; 
                    next();
                } else {
                    // Send 403 Forbidden status if credentials are invalid
                    res.status(403).render('access_denied', { message: 'Access Denied: Invalid credentials.' });
                }
            })
            .catch(error => {
                console.error(error);
                res.redirect('/signin');
            });
    } else {
        // Send 403 Forbidden status if not logged in
        res.status(403).render('access_denied', { message: 'Access Denied: You must be signed in.' });
    }
}
// Inbox route with authentication
app.get('/inbox', authenticateUser, async (req, res) => {
    const userId = req.user.id;
    const { recentPage = 1, pageSize = 5 } = req.query;
    const offset = (recentPage - 1) * pageSize;

    try {
        // Fetch emails with sender information
        const mails = await fetchReceiveEmails(userId, pageSize, offset);

        // Get total emails count
        const totalCount = await getTotalReceiveEmailsCount(userId);

        // Calculate total pages
        const totalPages = Math.ceil(totalCount / pageSize);

        // Render inbox view
        res.render('inbox', {
            fullName: req.user.fullName,
            sentEmails: mails,
            recentPage: Number(recentPage),
            totalPages,
            pageSize: Number(pageSize)
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

//  to fetch receive emails
async function fetchReceiveEmails(userId, pageSize, offset) {
    return await query(`
        SELECT emails.*, 
               sender.fullName AS sender_name
        FROM emails
        JOIN users AS sender ON emails.sender_id = sender.id
        WHERE emails.receiver_id = ?
          AND emails.receiver_email_delete IS NULL
        ORDER BY sent_at DESC
        LIMIT ? OFFSET ?;
    `, [userId, Number(pageSize), Number(offset)]);
}

//  to get total receive email count
async function getTotalReceiveEmailsCount(userId) {
    const result = await query(`
        SELECT COUNT(*) AS total_count 
        FROM emails
        WHERE receiver_id = ?
          AND receiver_email_delete IS NULL;
    `, [userId]);
    return result[0].total_count;
}
// Outbox route with authentication
app.get('/outbox', authenticateUser, async (req, res) => {
    const userId = req.user.id; // Current user ID
    const { recentPage = 1, pageSize = 5 } = req.query;
    const offset = (recentPage - 1) * pageSize;

    try {
        // Fetch sent emails with receiver information
        const mails = await getSentEmails(userId, pageSize, offset);

        // Get total count of sent emails
        const totalCount = await getTotalSentEmailsCount(userId);

        // Calculate total pages
        const totalPages = Math.ceil(totalCount / pageSize);

        // Render outbox view
        res.render('outbox', {
            fullName: req.user.fullName,
            receivedEmails: mails,
            recentPage: Number(recentPage),
            totalPages,
            pageSize: Number(pageSize)
        });

        console.log({ userId, recentPage, pageSize, offset });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

//to fetch sent emails
async function getSentEmails(userId, pageSize, offset) {
    return await query(`
        SELECT emails.*, 
               receiver.fullName AS receiver_name
        FROM emails
        JOIN users AS receiver ON emails.receiver_id = receiver.id
        WHERE emails.sender_id = ?
          AND emails.sender_email_delete IS NULL
        ORDER BY sent_at DESC
        LIMIT ? OFFSET ?;
    `, [userId, Number(pageSize), Number(offset)]);
}

// to get total count of sent emails
async function getTotalSentEmailsCount(userId) {
    const result = await query(`
        SELECT COUNT(*) AS total_count 
        FROM emails
        WHERE sender_id = ?
          AND sender_email_delete IS NULL;
    `, [userId]);
    return result[0].total_count;
}
//GEt route for detail page
app.get('/emailDetail', authenticateUser, async (req, res) => {
    const emailId = req.query.id;

    const emailDetailQuery = `
        SELECT emails.*, 
               sender.fullName AS sender_name,
               receiver.fullName AS receiver_name
        FROM emails
        JOIN users AS sender ON emails.sender_id = sender.id
        JOIN users AS receiver ON emails.receiver_id = receiver.id
        WHERE emails.id = ?
    `;

    try {
        // Await the query result
        const [emailDetails] = await query(emailDetailQuery, [emailId]);

        res.render('emailDetail', {
            fullName: req.user.fullName,
            emailDetails
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});
//GET route for the signup page   
app.get('/signup', (req, res) => {
    res.render('signup', { error: null, success: null });
});
  
//GET route for the compose page 
app.get('/compose', authenticateUser, async (req, res) => {
    const usersQuery = `
        SELECT id, fullName, email FROM users WHERE id != ?;  -- Exclude the current user
    `;

    try {
        // Ensure the user object is populated
        if (!req.user || !req.user.fullName) {
            throw new Error('User not authenticated or fullName not found');
        }

        const users = await query(usersQuery, [req.user.id]);

        res.render('compose', {
            fullName: req.user.fullName, // Pass the user's full name
            users,                        // Pass the list of users
            message: null                 // Initialize the message variable
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

//POST route for compose page 
app.post('/compose', authenticateUser, upload.single('file'), async (req, res) => {
    const { recipient, subject, body } = req.body;
    const attachment = req.file ? req.file.filename : null; // Get the filename
    const attachmentType = req.file ? req.file.mimetype : null;
    const attachmentSize = req.file ? req.file.size : null;

    // Insert email details into the database
    await query(
        'INSERT INTO emails (sender_id, receiver_id, subject, body, attachment, attachment_type, attachment_size) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, recipient, subject, body, attachment, attachmentType, attachmentSize]
    );

    // Redirect back to the compose page with a success message and attachment URL
    res.render('compose', {
        fullName: req.user.fullName,
        users: await query('SELECT id, fullName, email FROM users WHERE id != ?', [req.user.id]),
        message: {
            type: 'success',
            text: 'Email saved successfully!',
            attachment: attachment // Include the attachment URL in the response
        }
    });
});

//Download file 
app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename; // Get the filename from the request
    const filepath = path.join(uploads_dir, filename); // Construct the full path

    console.log(`Attempting to download file from: ${filepath}`); // Log the full path

    res.download(filepath, (err) => {
        if (err) {
            console.error('Error downloading file:', err);
            res.status(404).send('File not found'); // Handle file not found error
        }
    });
});
//POST route to handle signup form submission           
app.post('/signup', async (req, res) => {
    const { fullName, email, password, confirmPassword } = req.body;

    // Validation
    const varError = validateSignup(fullName, email, password, confirmPassword);
    if (varError.length > 0) {
        return res.render('signup', { error: varError[0], success: null });
    }

    try {
        // Check if email already exists
        const existingUser = await query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.render('signup', { error: 'Email is already in use.', success: null });
        }

        // Insert new user into the database (hash password in a real application)
        const newUser = { fullName, email, password }; // Remember to hash the password before saving
        await query('INSERT INTO users SET ?', newUser);

        // Render the success message
        res.render('signup', { success: "The account was successfully created. Click here to go back to login.", error: null });
    } catch (err) {
        console.error(err);
        res.render('signup', { error: 'Database error', success: null });
    }
});

// Helper function for validation
function validateSignup(fullName, email, password, confirmPassword) {
    const errors = [];
    if ([fullName, email, password, confirmPassword].some(field => !field)) {
        errors.push('All fields are required.');
    }
    if (password.length < 6) {
        errors.push('Password must be at least 6 characters long.');
    }
    if (password !== confirmPassword) {
        errors.push('Passwords do not match.');
    }
    return errors;
}

//Route to delete mail 
app.delete('/api/delete-ib_emails', authenticateUser, async (req, res) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        console.error('Invalid email IDs provided:', ids);
        return res.status(400).send('Invalid email IDs provided.');
    }

   try {
        const checked = ids.map(() => '?').join(',');
        const sql = `UPDATE emails SET receiver_email_delete = CURRENT_TIMESTAMP WHERE id IN (${checked}) AND receiver_id = ?`;
        const values = [...ids, req.user.id];
        await query(sql, values);
        res.status(204).send(); // No content, successful deletion
    } catch (err) {
        console.error('Error deleting emails:', err);
        res.status(500).send('An error occurred while deleting the emails.');
    }
});
app.delete('/api/delete-ob_emails', authenticateUser, async (req, res) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        console.error('Invalid email IDs provided:', ids);
        return res.status(400).send('Invalid email IDs provided.');
    }
    try {
        const checked = ids.map(() => '?').join(',');
        const sql = `UPDATE emails SET sender_email_delete = CURRENT_TIMESTAMP WHERE id IN (${checked}) AND sender_id = ?`;
        const values = [...ids, req.user.id];
        await query(sql, values);
        res.status(204).send(); // No content, successful deletion
    } catch (err) {
        console.error('Error deleting emails:', err);
        res.status(500).send('An error occurred while deleting the emails.');
    }
});

app.get('/logout', (req, res) => {
    // Clear cookies on logout
    res.clearCookie('username');
    res.clearCookie('password');
    res.redirect('/signin'); // Redirect to sign-in page after logout
});      
// Start the server
app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}/`);
});