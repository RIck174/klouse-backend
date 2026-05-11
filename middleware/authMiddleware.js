const jwt = require("jsonwebtoken");

const protect=(req,res,next)=>{
    const authHeader= req.headers.authorization;
    
    if(!authHeader || !authHeader.startsWith("Bearer")){
        return res.status(401).json({message:"You are not authorized to access this information"})
    }
    try{
        const token = authHeader.split(" ")[1];
        const decoded= jwt.verify(token,process.env.JWT_SECRET);
        req.user=decoded;
        next();
    }catch(err){
        return res.status(401).json({message:"Token Invalid"})
    }
}
module.exports= protect;