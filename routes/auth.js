const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

// Register
router.post('/register', async (req, res) =>{

    try {
    const {name, email, password} = req.body;

    const existingUser = await User.findOne({email});
    if(existingUser){
        return res.status(400).json({message: 'User already exists'});
    }

    const user = new User({name, email, password});
    await user.save();

    const token = jwt.sign({userId: user._id}, JWT_SECRET, {expiresIn: '1h'});
    res.status(201).json({token, user: {
        id: user._id,
        name: user.name,
        email: user.email
    }});
} catch(error) {
    res.status(500).json({message: error.message});
}
});

//login

router.post('/login', async(req, res) =>{
    try {
        const {email, password} = req.body;

        const user = await User.findOne({ email });
        if(!user) {
            return res.status(400).json({message: 'Invalid credentials'});
        }

        const isValid = await user.comparePassword(password);
        if(!isValid) {
            return res.status(400).json({message: 'Invalid credentials'});
        }

        const token = jwt.sign({userId : user._id}, JWT_SECRET, {expiresIn: '1h'});
        res.json({
            token,
            user : {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    }catch(error) {
        res.status(500).json({message: error.message});
    }
});

module.exports = router;