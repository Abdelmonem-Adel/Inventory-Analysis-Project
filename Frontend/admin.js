const userInfo = JSON.parse(localStorage.getItem('userInfo'));

if (!userInfo || (userInfo.role !== 1 && userInfo.role !== 0)) {
    window.location.href = 'index.html';
}

const usersList = document.getElementById('usersList');
const createUserForm = document.getElementById('createUserForm');
const statusMsg = document.getElementById('statusMsg');
const editUserModal = document.getElementById('editUserModal');
const editUserForm = document.getElementById('editUserForm');

// UI visibility for Top Admin
if (userInfo.role === 0) {
    document.getElementById('actionsHeader').style.display = 'table-cell';
}

// Fetch and display users
const fetchUsers = async () => {
    try {
        const response = await fetch('/api/auth/users', {
            headers: {
                'Authorization': `Bearer ${userInfo.token}`
            }
        });
        const users = await response.json();

        usersList.innerHTML = users.map(user => {
            let roleClass = 'role-user';
            let roleName = 'User';
            if (user.role === 0) { roleClass = 'role-admin'; roleName = 'Top Admin'; }
            else if (user.role === 1) { roleClass = 'role-admin'; roleName = 'Admin'; }
            else if (user.role === 3) { roleClass = 'role-manager'; roleName = 'Manager'; }

            const actionButtons = userInfo.role === 0 ? `
                <button onclick="openEditModal('${user._id}', '${user.username}', ${user.role})" class="btn-action btn-edit">Edit</button>
                <button onclick="deleteUser('${user._id}')" class="btn-action btn-delete">Delete</button>
            ` : '';

            return `
                <tr>
                    <td>${user.username}</td>
                    <td><span class="role-badge ${roleClass}">${roleName}</span></td>
                    ${userInfo.role === 0 ? `<td>${actionButtons}</td>` : ''}
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error fetching users:', error);
    }
};

window.deleteUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
        const response = await fetch(`/api/auth/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${userInfo.token}` }
        });
        if (response.ok) fetchUsers();
    } catch (error) {
        console.error('Error deleting user:', error);
    }
};

window.openEditModal = (id, username, role) => {
    document.getElementById('edit_user_id').value = id;
    document.getElementById('edit_username').value = username;
    document.getElementById('edit_role').value = role;
    editUserModal.style.display = 'block';
};

window.closeEditModal = () => {
    editUserModal.style.display = 'none';
};

editUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit_user_id').value;
    const username = document.getElementById('edit_username').value;
    const role = parseInt(document.getElementById('edit_role').value);
    const password = document.getElementById('edit_password').value;

    const body = { username, role };
    if (password) body.password = password;

    try {
        const response = await fetch(`/api/auth/users/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userInfo.token}`
            },
            body: JSON.stringify(body)
        });
        if (response.ok) {
            closeEditModal();
            fetchUsers();
        }
    } catch (error) {
        console.error('Error updating user:', error);
    }
});


// Create new user
createUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('new_username').value;
    const password = document.getElementById('new_password').value;
    const role = parseInt(document.getElementById('new_role').value);

    statusMsg.style.display = 'none';

    try {
        const response = await fetch('/api/auth/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userInfo.token}`
            },
            body: JSON.stringify({ username, password, role })
        });

        const data = await response.json();

        if (response.ok) {
            statusMsg.textContent = 'User created successfully!';
            statusMsg.style.color = 'var(--success)';
            statusMsg.style.display = 'block';
            createUserForm.reset();
            fetchUsers();
        } else {
            statusMsg.textContent = data.message || 'Failed to create user';
            statusMsg.style.color = 'var(--danger)';
            statusMsg.style.display = 'block';
        }
    } catch (error) {
        statusMsg.textContent = 'Network error';
        statusMsg.style.color = 'var(--danger)';
        statusMsg.style.display = 'block';
    }
});

fetchUsers();
