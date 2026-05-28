const express = require('express');
const app = express();

// tell express to serve static files from the dist folder
app.use(express.static('dist'));



app.listen((process.env.PORT || 3000), () => {
  console.log('Server running');
});