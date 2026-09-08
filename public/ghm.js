// ==========================================
// GHM Core Client Library (v1.0)
// Custom Backend as a Service
// ==========================================

const GHM = (() => {
    // Default API URL (can be overridden with GHM_CONFIG)
    let API_URL = 'https://ghm-core.onrender.com';
    
    // Internal state
    let authToken = localStorage.getItem('ghm_token') || null;

    // Helper function for API calls
    async function request(endpoint, options = {}) {
        const headers = options.headers || {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }
        return data;
    }

    return {
        // Initialize with custom URL
        init: (customUrl) => {
            if (customUrl) API_URL = customUrl;
            console.log(`📡 GHM Client connected to: ${API_URL}`);
        },

        // ============ AUTH ============
        auth: {
            async signIn(email, password) {
                const data = await request('/api/v1/auth/signin', {
                    method: 'POST',
                    body: JSON.stringify({ email, password })
                });
                authToken = data.token;
                localStorage.setItem('ghm_token', data.token);
                return data;
            },
            async signUp(email, password, invite_code, full_name) {
                const data = await request('/api/v1/auth/signup', {
                    method: 'POST',
                    body: JSON.stringify({ email, password, invite_code, full_name })
                });
                authToken = data.token;
                localStorage.setItem('ghm_token', data.token);
                return data;
            },
            signOut() {
                authToken = null;
                localStorage.removeItem('ghm_token');
            },
            getToken() {
                return authToken;
            },
            isLoggedIn() {
                return !!authToken;
            }
        },

        // ============ DATABASE (Generic CRUD) ============
        from: (table) => {
            return {
                async select() {
                    const data = await request(`/api/v1/tables/${table}`);
                    return data.data || data;
                },
                async insert(values) {
                    return await request(`/api/v1/tables/${table}`, {
                        method: 'POST',
                        body: JSON.stringify(values)
                    });
                },
                async update(id, values) {
                    return await request(`/api/v1/tables/${table}/${id}`, {
                        method: 'PUT',
                        body: JSON.stringify(values)
                    });
                },
                async delete(id) {
                    return await request(`/api/v1/tables/${table}/${id}`, {
                        method: 'DELETE'
                    });
                }
            };
        },

        // ============ ADMIN ============
        admin: {
            async getStats() {
                return await request('/api/v1/admin/stats');
            },
            async getUsers() {
                return await request('/api/v1/admin/users');
            }
        },

        // ============ STORAGE ============
        storage: {
            async upload(file) {
                const formData = new FormData();
                formData.append('file', file);
                
                const headers = {};
                if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

                const response = await fetch(`${API_URL}/api/v1/storage/upload`, {
                    method: 'POST',
                    headers,
                    body: formData
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                return data;
            },
            async listFiles() {
                const headers = {};
                if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
                
                const response = await fetch(`${API_URL}/api/v1/storage/files`, {
                    headers
                });
                return await response.json();
            }
        }
    };
})();

// Expose to window
window.GHM = GHM;