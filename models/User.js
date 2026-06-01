const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    name : {
        type: String,
        required: true
    },
    email :{
        type: String,
        required: true,
        unique: true
    },
    password :{
        type: String,
        required: true
    },
    createdAt :{
        type: Date,
        default: Date.now
    },
});

// Hash password before saving
UserSchema.pre('save', async function(){
    if(!this.isModified('password')){
        return;
    };
     const salt = await bcrypt.genSalt(10);
     this.password = await bcrypt.hash(this.password, salt);
});

//compare password method
UserSchema.methods.comparePassword = async function(candidatePassword){
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);