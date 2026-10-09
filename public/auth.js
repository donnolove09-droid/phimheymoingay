const API = '/api';
const $ = id => document.getElementById(id);

let mode = 'login';
let pendingEmail = '';

function showState(name) {
    ['Form', 'Otp', 'Done'].forEach(s => {
        const el = $(`state${s}`);
        if (el) el.classList.add('hidden');
    });
    $(`state${name}`).classList.remove('hidden');
}

function setMode(m) {
    mode = m;
    $('tabLogin').classList.toggle('active', m === 'login');
    $('tabRegister').classList.toggle('active', m === 'register');
    $('pageTitle').textContent = m === 'login' ? 'Đăng nhập' : 'Đăng ký';
    $('pageDesc').textContent = m === 'login' ? 'Chào mừng trở lại PhimHay' : 'Tạo tài khoản mới';
    $('btnSubmit').textContent = m === 'login' ? 'Đăng nhập' : 'Đăng ký';
    $('emailGroup').style.display = m === 'register' ? 'block' : 'none';
    $('labelUser').textContent = m === 'login' ? 'Email hoặc username' : 'Username';
    $('inputUsername').placeholder = m === 'login' ? 'Nhập email hoặc username' : 'Tên đăng nhập';
    $('inputEmail').value = '';
    $('inputUsername').value = '';
    $('inputPassword').value = '';
    $('errorMsg').textContent = '';
    $('errorMsg').style.color = '#ff4757';
    showState('Form');
}

$('tabLogin').onclick = () => setMode('login');
$('tabRegister').onclick = () => setMode('register');

$('btnSubmit').onclick = async () => {
    $('errorMsg').textContent = '';
    $('errorMsg').style.color = '#ff4757';
    $('btnSubmit').disabled = true;
    $('btnSubmit').textContent = 'Đang xử lý...';

    try {
        if (mode === 'login') {
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    emailOrUsername: $('inputUsername').value.trim(),
                    password: $('inputPassword').value
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            localStorage.setItem('phimhay_user_token', data.token);
            localStorage.setItem('phimhay_user', JSON.stringify(data.user));
            showState('Done');
            setTimeout(() => location.href = '/', 1200);
        } else {
            const email = $('inputEmail').value.trim();
            const username = $('inputUsername').value.trim();
            const password = $('inputPassword').value;

            const res = await fetch(`${API}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            pendingEmail = data.email;
            showState('Otp');
            const firstInput = document.querySelector('.otp-input');
            if (firstInput) firstInput.focus();
        }
    } catch (e) {
        $('errorMsg').textContent = e.message;
    } finally {
        $('btnSubmit').disabled = false;
        $('btnSubmit').textContent = mode === 'login' ? 'Đăng nhập' : 'Đăng ký';
    }
};

document.querySelectorAll('.otp-input').forEach((input, idx, arr) => {
    input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
        if (e.target.value && idx < arr.length - 1) arr[idx + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) arr[idx - 1].focus();
    });
    input.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        text.split('').forEach((c, i) => { if (arr[i]) arr[i].value = c; });
        if (text.length) arr[Math.min(text.length, 5)].focus();
    });
});

$('btnVerifyOtp').onclick = async () => {
    $('otpError').textContent = '';
    $('otpError').style.color = '#ff4757';
    const code = Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
    if (code.length !== 6) { $('otpError').textContent = 'Nhập đủ 6 số'; return; }

    $('btnVerifyOtp').disabled = true;
    $('btnVerifyOtp').textContent = 'Đang xác thực...';
    try {
        const res = await fetch(`${API}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingEmail, code })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        localStorage.setItem('phimhay_user_token', data.token);
        localStorage.setItem('phimhay_user', JSON.stringify(data.user));
        showState('Done');
        setTimeout(() => location.href = '/', 1200);
    } catch (e) {
        $('otpError').textContent = e.message;
    } finally {
        $('btnVerifyOtp').disabled = false;
        $('btnVerifyOtp').textContent = 'Xác thực';
    }
};

$('btnResend').onclick = async () => {
    $('otpError').style.color = '#9a9aa3';
    $('otpError').textContent = 'Đang gửi lại...';
    try {
        const res = await fetch(`${API}/auth/resend-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingEmail })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        $('otpError').style.color = '#22c55e';
        $('otpError').textContent = 'Đã gửi lại mã mới';
        setTimeout(() => {
            $('otpError').textContent = '';
            $('otpError').style.color = '#ff4757';
        }, 3000);
    } catch (e) {
        $('otpError').style.color = '#ff4757';
        $('otpError').textContent = e.message;
    }
};

$('inputPassword').addEventListener('keypress', e => {
    if (e.key === 'Enter') $('btnSubmit').click();
});

if (localStorage.getItem('phimhay_user_token')) {
    location.href = '/';
}

setMode('login');
