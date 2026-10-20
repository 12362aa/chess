'use strict';
const value=process.env.JWT_SECRET;
if(!value || value==='amkh_fallback_secret_key_123')throw new Error('Configure a private JWT_SECRET before starting the server');
module.exports=value;
