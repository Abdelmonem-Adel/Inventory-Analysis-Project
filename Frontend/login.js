document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    const btnText = document.getElementById('btnText');
    const loader = document.getElementById('loader');
    const errorMsg = document.getElementById('errorMsg');

    // Reset UI
    errorMsg.style.display = 'none';
    btnText.style.display = 'none';
    loader.style.display = 'block';
    loginBtn.disabled = true;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Save user data and token
            localStorage.setItem('userInfo', JSON.stringify(data));
            // Redirect to dashboard
            window.location.href = 'index.html';
        } else {
            errorMsg.textContent = data.message || 'Login failed';
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        errorMsg.textContent = 'Network error. Please try again.';
        errorMsg.style.display = 'block';
    } finally {
        btnText.style.display = 'block';
        loader.style.display = 'none';
        loginBtn.disabled = false;
    }
});

// Check if already logged in
if (localStorage.getItem('userInfo')) {
    window.location.href = 'index.html';
}
