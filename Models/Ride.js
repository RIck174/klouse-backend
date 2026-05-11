const mongoose= require("mongoose");

const rideSchema= new mongoose.Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required: true
    },
    driverName:{
        type:String,
        default:""
    },
    pickup:{
        type:{
            type:String,
            enum:["Point"],
            default:"Point"
        },
        coordinates:{
            type:[Number],
            required:true
        }
    },
    destination:{
        type:{
            type:String,
            enum:["Point"],
            default:"Point"
        },
        coordinates:{
            type:[Number],
            required:true
        }
    },
    driversNotified:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
        }
    ],

    acceptedBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    status:{
        type:String,
        enum:["Searching","Accepted","Cancelled","Completed"],
        default:"Searching"
    },

    fare:{
        type:Number,
        default:0
    },

    destinationName:{
        type:String,
        default:""
    }
    
},{timestamps:true});

rideSchema.index({pickup:"2dsphere"});

module.exports= mongoose.model("Ride",rideSchema);