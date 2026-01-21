const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
require('dotenv').config();

const app = express();

// ============ CONFIGURATION ============
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bangaloreconnect';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============ MIDDLEWARE ============
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'bangalore-connect-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: {
        secure: NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
    }
}));

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============ DATABASE MODELS ============
// Job Schema
const jobSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: String,
        required: true,
        trim: true
    },
    location: {
        type: String,
        required: true,
        trim: true,
        default: 'Bangalore'
    },
    type: {
        type: String,
        required: true,
        enum: ['Full-time', 'Part-time', 'Remote', 'Hybrid', 'Internship', 'Contract', 'Freelance'],
        default: 'Full-time'
    },
    experience: {
        type: String,
        default: 'Fresher'
    },
    salary: {
        type: String,
        default: 'Not disclosed'
    },
    applyLink: {
        type: String,
        default: ''
    },
    shortDescription: {
        type: String,
        required: true
    },
    fullDescription: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'deleted'],
        default: 'active'
    },
    postedDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const Job = mongoose.model('Job', jobSchema);

// ============ HELPER FUNCTIONS ============
function formatDate(date) {
    if (!date) return 'Recently';
    
    const now = new Date();
    const jobDate = new Date(date);
    const diffTime = Math.abs(now - jobDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays <= 7) return `${diffDays} days ago`;
    
    return jobDate.toLocaleDateString('en-IN', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
    });
}

function generateCaptcha() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let captcha = '';
    for (let i = 0; i < 6; i++) {
        captcha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return captcha;
}

// ============ MIDDLEWARES ============
const isAdmin = (req, res, next) => {
    if (req.session.adminLoggedIn) {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

// ============ ROUTES ============

// ----- PUBLIC ROUTES -----

// Homepage
app.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        
        const jobs = await Job.find({ status: 'active' })
            .sort({ postedDate: -1 })
            .skip(skip)
            .limit(limit);
            
        const totalJobs = await Job.countDocuments({ status: 'active' });
        const totalPages = Math.ceil(totalJobs / limit);
        
        res.render('index', {
            title: 'Bangalore Connect - Find Your Dream Job',
            jobs,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            query: '',
            filters: {},
            formatDate
        });
    } catch (err) {
        console.error('Error loading homepage:', err);
        res.status(500).render('error', { 
            title: 'Server Error',
            error: 'Error loading homepage' 
        });
    }
});

// Job Detail Page
app.get('/job/:id', async (req, res) => {
    try {
        const job = await Job.findOne({ 
            _id: req.params.id, 
            status: 'active' 
        });
        
        if (!job) {
            return res.status(404).render('error', { 
                title: 'Job Not Found',
                error: 'Job not found or has been removed' 
            });
        }
        
        res.render('job-detail', {
            title: `${job.title} at ${job.company}`,
            job,
            formatDate
        });
    } catch (err) {
        console.error('Error loading job detail:', err);
        res.status(500).render('error', { 
            title: 'Server Error',
            error: 'Error loading job details' 
        });
    }
});

// WhatsApp redirect
app.get('/whatsapp', (req, res) => {
    res.redirect('https://chat.whatsapp.com/KhTXl9CNMbSG8mv6nYCAAW');
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'BangaloreConnect is running',
        timestamp: new Date().toISOString()
    });
});

// ----- ADMIN ROUTES -----

// Admin Login Page
app.get('/admin/login', (req, res) => {
    if (req.session.adminLoggedIn) {
        return res.redirect('/admin/dashboard');
    }
    
    res.render('admin', {
        title: 'Admin Login',
        error: null,
        captcha: generateCaptcha()
    });
});

// Admin Login POST
app.post('/admin/login', (req, res) => {
    const { username, password, captcha } = req.body;
    const storedCaptcha = req.body.captchaHidden;
    
    // CAPTCHA validation
    if (captcha !== storedCaptcha) {
        return res.render('admin', {
            title: 'Admin Login',
            error: 'Invalid CAPTCHA. Please try again.',
            captcha: generateCaptcha()
        });
    }
    
    // Admin credentials
    const adminUsername = process.env.ADMIN_USERNAME || 'Ruhan@0312';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Ruhan@0312';
    
    if (username === adminUsername && password === adminPassword) {
        req.session.adminLoggedIn = true;
        req.session.adminUsername = username;
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin', {
            title: 'Admin Login',
            error: 'Invalid username or password',
            captcha: generateCaptcha()
        });
    }
});

// Admin Dashboard
app.get('/admin/dashboard', isAdmin, async (req, res) => {
    try {
        const totalJobs = await Job.countDocuments({ status: 'active' });
        const recentJobs = await Job.find({ status: 'active' })
            .sort({ postedDate: -1 })
            .limit(5);
        
        res.render('dashboard', {
            title: 'Admin Dashboard',
            username: req.session.adminUsername,
            totalJobs,
            recentJobs,
            success: req.query.success,
            error: req.query.error,
            formatDate
        });
    } catch (err) {
        console.error('Error loading dashboard:', err);
        res.status(500).render('error', { 
            title: 'Server Error',
            error: 'Error loading dashboard' 
        });
    }
});

// Post Job Page (Form)
app.get('/admin/post-job', isAdmin, (req, res) => {
    res.render('post-job', {
        title: 'Post New Job',
        username: req.session.adminUsername,
        job: null,
        error: null,
        success: null
    });
});

// Submit New Job - POST
app.post('/admin/post-job', isAdmin, async (req, res) => {
    try {
        const {
            title,
            company,
            location,
            type,
            experience,
            salary,
            applyLink,
            shortDescription,
            fullDescription
        } = req.body;
        
        // Validation
        if (!title || !company || !location || !shortDescription || !fullDescription) {
            return res.render('post-job', {
                title: 'Post New Job',
                username: req.session.adminUsername,
                job: req.body,
                error: 'Please fill all required fields (Title, Company, Location, and both descriptions)',
                success: null
            });
        }
        
        // Create new job
        const newJob = new Job({
            title: title.trim(),
            company: company.trim(),
            location: location.trim(),
            type: type || 'Full-time',
            experience: experience || 'Fresher',
            salary: salary || 'Not disclosed',
            applyLink: applyLink || '',
            shortDescription: shortDescription.trim(),
            fullDescription: fullDescription.trim(),
            status: 'active'
        });
        
        // Save to MongoDB
        await newJob.save();
        
        // Show success message
        res.render('post-job', {
            title: 'Post New Job',
            username: req.session.adminUsername,
            job: null,
            error: null,
            success: 'Job posted successfully! You can post another job or go back to dashboard.'
        });
        
    } catch (err) {
        console.error('Error posting job:', err);
        res.render('post-job', {
            title: 'Post New Job',
            username: req.session.adminUsername,
            job: req.body,
            error: `Error posting job: ${err.message}`,
            success: null
        });
    }
});

// Delete Job
app.post('/admin/delete-job/:id', isAdmin, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (job) {
            job.status = 'deleted';
            await job.save();
            res.redirect('/admin/dashboard?success=Job deleted successfully!');
        } else {
            res.redirect('/admin/dashboard?error=Job not found');
        }
    } catch (err) {
        console.error('Error deleting job:', err);
        res.redirect('/admin/dashboard?error=Error deleting job');
    }
});

// Admin Logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// ============ DATABASE CONNECTION ============
async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ MongoDB connected successfully');
        
        // Create indexes
        await Job.createIndexes();
        console.log('✅ Database indexes created');
        
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1); // Exit if DB connection fails
    }
}

// ============ START SERVER ============
async function startServer() {
    // Connect to database first
    await connectDB();
    
    // Start server
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌐 Environment: ${NODE_ENV}`);
        console.log(`🔗 Local: http://localhost:${PORT}`);
        console.log(`🔐 Admin: http://localhost:${PORT}/admin/login`);
        console.log(`👤 Username: ${process.env.ADMIN_USERNAME || 'Ruhan@0312'}`);
        console.log(`🔑 Password: ${process.env.ADMIN_PASSWORD || 'Ruhan@0312'}`);
        
        if (NODE_ENV === 'production') {
            console.log('📦 Running in PRODUCTION mode');
        }
    });
}

startServer();

// ============ ERROR HANDLERS ============
// 404 Error Handler
app.use((req, res) => {
    res.status(404).render('error', { 
        title: 'Page Not Found',
        error: 'The page you are looking for does not exist.' 
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).render('error', { 
        title: 'Server Error',
        error: 'Something went wrong on our end. Please try again later.' 
    });
});
