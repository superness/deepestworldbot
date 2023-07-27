fetch('https://raw.githubusercontent.com/superness/deepestworldbot/main/deepestworldex.analytics.js')
    .then(response => response.text())
    .then(code => {
        code = `(function() {\n${code}\n})()`;
        
        // Run the code
        eval(code);
    })
    .catch(err => console.error('Failed to load and run script:', err));
