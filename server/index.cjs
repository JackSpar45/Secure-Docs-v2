const express = require('express');
const multer = require('multer');
const aesjs = require('aes-js');
const { PinataSDK } = require('pinata-web3');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Blob } = require('buffer');
//const mime = require('mime-types');
const path = require('path');
const fs  = require('fs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const authenticateToken = require('../src/middleware/authenticate.cjs'); 
require('dotenv').config();

const PINATA_JWT = process.env.pinataJwt;
const app = express();
const port = 5000;

// Middleware
app.use(bodyParser.json());
app.use(cors(
  {
    origin: 'https://securedocsv2.vercel.app', // frontend URL
    credentials: true
  }
));
app.use(cookieParser());

// Pinata setup 
const pinata = new PinataSDK({ 
   pinataJwt: PINATA_JWT,
   pinataGateway: process.env.PINATA_GATEWAY,
});
// Connect to MongoDB
const uri = process.env.MONGODB_URI;
mongoose.connect(uri)
.then(() => console.log('MongoDB connected...'))
.catch(err => console.log(err));

// Define User Schema
const userSchema = new mongoose.Schema({
    email: { type: String, unique: true },
    password: String,
    registeredAt: { type: String },
    loginTimestamps:{type: [String], default: [] },
    files: [{ 
      filename: String, 
      hash: String, 
      pinataId: String,
      iv: String, 
      key: String}]
});

const User = mongoose.model('User', userSchema);

// Registration Route
app.post('/register', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Check if email already exists 
        const existingUser = await User.findOne({ email });
        if (existingUser) { 
            return res.status(400).send('Email is already registered'); 
        }
        //Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const registeredAt = new Date().toLocaleString();
        const newUser = new User({ 
          email, 
          password: hashedPassword,
          registeredAt: registeredAt           
        });
        await newUser.save();
        res.status(201).send('User registered successfully');
        
    } catch (error) {
        res.status(500).send('Error registering user');
    }
});


// Login Route
app.post('/login', async (req, res) => {
    const { email, password, token } = req.body;

  try {
    const captchaResponse = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify`,
      null,
      {
        params: {
          secret: `${process.env.RECAPTCHA_SECRET}`,
          response: token,
        },
      }
    );

      if (!captchaResponse.data.success) {
        return res.status(400).send('CAPTCHA verification failed');
      }
  
      // Find the user by email
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).send('Invalid email or password');
      }
  
      // Compare the entered password with the hashed password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).send('Invalid email or password');
      }
  
      // Password matches, proceed with login
      const loginTimestamp = new Date().toLocaleString();
      user.loginTimestamps.push(loginTimestamp);
      await user.save();
      
      //Generate JWT Token
      const jwtToken = jwt.sign(
        { email: user.email, id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '2h' }
      );

      res.cookie('token', jwtToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'None',
        maxAge: 2 * 60 * 60 * 1000 // 2 hours
      });
      res.status(200).json({ message: 'Login successful'});

    } catch (error) {
      console.error('Error logging in user:', error);
      res.status(500).send('Error logging in user');
    }
  });

app.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.status(200).send('Logged out');
});

app.get('/validate', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, 'email loginTimestamps files');
    if (!user) return res.status(404).send('User not found');
    res.json({
      email: user.email,
      loginTimestamps: user.loginTimestamps,
      files: user.files
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Get User Profile Route
app.get('/profile', authenticateToken, async (req, res) => {
  const { email } = req.user;

  try {
      const user = await User.findOne({ email });
      if (!user) {
          return res.status(404).send('User not found');
      }

      res.status(200).send({
          email: user.email,
          registeredAt: user.registeredAt,
          loginTimestamps: user.loginTimestamps,
          files: user.files,
      });
  } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).send('Error fetching user profile');
  }
});

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

//Upload Route
app.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  const { email } = req.body;
  const file = req.file;

  try {
    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send('User not found');
    }

    // Generate AES key and IV
    const aesSecretKey = process.env.AES_SECRET_KEY;
    const key = aesjs.utils.utf8.toBytes(aesSecretKey); // 16-byte key
    const iv = crypto.randomBytes(16); // Generate a new IV for each file upload

    // Encrypt the file
    const aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
    const paddedFile = aesjs.padding.pkcs7.pad(file.buffer);
    const encryptedBytes = aesCbc.encrypt(paddedFile);

    // Convert encryptedBytes to a Blob
    const blob = new Blob([encryptedBytes], { type: 'application/octet-stream' });

    // Store the encrypted file in Pinata
    const result = await pinata.upload.file(blob);
    

    // Save the file reference in MongoDB 

    const { id } = result;
    user.files.push({
      filename: file.originalname,
      hash: result.IpfsHash,
      pinataId: id,
      iv: aesjs.utils.hex.fromBytes(iv),
      key: aesjs.utils.hex.fromBytes(key)
    });

 
    await user.save();
    const newFile = user.files[user.files.length - 1];
    res.status(200).json({file: newFile, message:'File uploaded and encrypted successfully'});
    
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Error uploading file');
  }
});


// Decrypt Route
app.post('/decrypt', authenticateToken, async (req, res) => {
  const { email, fileId } = req.body;

  try {
      // Find the user by email
      const user = await User.findOne({ email });
      if (!user) {
          return res.status(404).send('User not found');
      }

      // Find the file by ID
      const file = user.files.id(fileId);
      if (!file) {
          return res.status(404).send('File not found');
      }

      // Retrieve the encrypted file from IPFS using Axios
      const response = await axios.get(
          `https://${process.env.PINATA_GATEWAY}/ipfs/${file.hash}`, 
          { responseType: 'arraybuffer' }
      );
      const encryptedBytes = new Uint8Array(response.data);

      // Convert key and IV from hex to bytes
      const aesKey = aesjs.utils.hex.toBytes(file.key);
      const iv = aesjs.utils.hex.toBytes(file.iv);

      // Initialize AES CBC decryption
      const aesCbc = new aesjs.ModeOfOperation.cbc(aesKey, iv);

      // Decrypt the file
      const decryptedBytes = aesCbc.decrypt(encryptedBytes);

      // Remove padding
      const decryptedBytesUnpadded = aesjs.padding.pkcs7.strip(decryptedBytes);
      
      const downloadDir = '/tmp';  // Use /tmp directory 
      if (!fs.existsSync(downloadDir)) {
          fs.mkdirSync(downloadDir, { recursive: true });
      }
      
      const downloadPath = path.join(downloadDir, file.filename);
      fs.writeFileSync(downloadPath, Buffer.from(decryptedBytesUnpadded));

      // Instead of res.download(), send the file content
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(Buffer.from(decryptedBytesUnpadded));

  } catch (error) {
      console.error('Error decrypting file:', error);
      res.status(500).send('Error decrypting file');
  }
});

app.post('/share', authenticateToken, async(req, res) => {
  const {email ,recipientEmail, fileId }  = req.body;

  try{

    const sender = await User.findOne({ email });
    const recipient = await User.findOne({email: recipientEmail});
    if(!sender || !recipient){
      return res.status(500).send('Sender or Recipient not found');
    }
    const file = sender.files.id(fileId);
    if(!file){
      return res.status(404).send('File not found');
    }

    recipient.files.push({
      filename: file.filename,
      hash: file.hash,
      iv: file.iv,
      key: file.key,
    });

    await recipient.save();
    res.status(200).send('File shared successfully');

  } catch (error) {
     console.log('Error sharing file:', error);
     res.status(500).send('Error sharing file');
  }
});

//Delete file

app.post('/delete', authenticateToken, async (req, res) => {
  const { email, pinataId } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send('User not found');

    const fileToDelete = user.files.find(file => file.pinataId === pinataId);
    if (!fileToDelete) return res.status(404).send('File not found');

    // Delete from Pinata using CID
    await pinata.unpin(fileToDelete.hash);

    // Remove subdocument safely
    user.files.id(fileToDelete._id).deleteOne();
    await user.save();

    res.status(200).send('File deleted successfully');
  } catch (err) {
    console.error('Error(backend) deleting file:', err.response?.data || err.message || err);
    res.status(500).send('Error deleting file FROM BACKEND');
  }
});


// Start Server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});





