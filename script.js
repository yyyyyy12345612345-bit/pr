import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { OBJLoader } from "jsm/loaders/OBJLoader.js";
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, addDoc, getDocs, orderBy, query, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyB8NHUTR6Uzqh1YZAoPXzRy8aMgle9x7gU",
  authDomain: "yy10-ba274.firebaseapp.com",
  projectId: "yy10-ba274",
  storageBucket: "yy10-ba274.firebasestorage.app",
  messagingSenderId: "194649785258",
  appId: "1:194649785258:web:eeb335318731b1b2f7a1d3",
  measurementId: "G-13TSYVLG6G"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- 3D Scene Initialization ---
const initThree = () => {
    const container = document.getElementById('three-container');
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    camera.position.set(-7, -5, 11);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.setClearColor(0xffffff, 1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableZoom = false;

    // Floor Shader
    const floorMaterial = new THREE.ShaderMaterial({
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uCameraPosition;
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vec2 center = vec2(0.5, 0.5);
                float dist = distance(vUv, center);
                float animatedDist = dist - uTime * 0.01;
                float circle = mod(animatedDist, 0.06);
                float distFromEdge = min(circle, 0.06 - circle);
                float aaWidth = length(vec2(dFdx(animatedDist), dFdy(animatedDist))) * 2.0;
                float lineAlpha = 1.0 - smoothstep(0.018, 0.022, distFromEdge);
                vec3 baseColor = mix(vec3(1.0), vec3(0.0), lineAlpha);
                vec3 normal = normalize(vNormal);
                vec3 viewDir = normalize(uCameraPosition - vPosition);
                float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
                vec3 finalColor = baseColor + (vec3(1.0) * fresnel * 0.3);
                float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        uniforms: {
            uTime: { value: 0.0 },
            uCameraPosition: { value: new THREE.Vector3() },
        },
        side: THREE.DoubleSide,
        transparent: true,
    });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(20, 150), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    scene.add(floor);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    const loader = new OBJLoader();
    loader.load("https://cdn.jsdelivr.net/gh/danielyl123/person/person.obj", (object) => {
        object.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7, metalness: 0.3 });
                child.castShadow = true;
            }
        });
        const box = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        object.traverse((child) => { if (child.isMesh && child.geometry) child.geometry.translate(-center.x, -center.y, -center.z); });
        const scale = 4 / Math.max(size.x, size.y, size.z);
        object.scale.set(scale, scale, scale);
        object.position.set(0, 1, 0);
        object.rotation.y = Math.PI / 3;
        scene.add(object);
    });

    let time = 0;
    const animate = () => {
        requestAnimationFrame(animate);
        time += 0.016;
        floorMaterial.uniforms.uTime.value = time;
        floorMaterial.uniforms.uCameraPosition.value.copy(camera.position);
        renderer.render(scene, camera);
        controls.update();
    };
    animate();

    window.addEventListener("resize", () => {
        renderer.setSize(container.clientWidth, container.clientHeight);
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
    });
};

// --- Portfolio Rendering ---
const fetchProjects = async () => {
    const container = document.getElementById('projects-container');
    const adminList = document.getElementById('admin-projects-list');
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    
    try {
        const querySnapshot = await getDocs(q);
        container.innerHTML = '';
        if (adminList) adminList.innerHTML = '';
        
        if (querySnapshot.empty) {
            container.innerHTML = '<p class="empty-msg">No projects showcased yet.</p>';
            if (adminList) adminList.innerHTML = '<p>No projects in the database.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            
            // Public View
            container.innerHTML += `
                <div class="project-card glass reveal-up">
                    <div class="card-glow"></div>
                    <div class="project-img">
                        <img src="${data.image || 'https://images.unsplash.com/photo-1555066931-4365d14bab8c'}" alt="${data.title}">
                    </div>
                    <div class="project-info">
                        <h3>${data.title}</h3>
                        <p>${data.description}</p>
                        <div class="project-tags">
                            ${(data.tags || '').split(',').map(tag => `<span>${tag.trim()}</span>`).join('')}
                        </div>
                        ${data.link ? `<a href="${data.link}" target="_blank" class="btn btn-outline" style="margin-top: 1.5rem;">View Source <i class="fas fa-external-link-alt"></i></a>` : ''}
                    </div>
                </div>
            `;

            // Admin List
            if (adminList) {
                adminList.innerHTML += `
                    <div class="admin-list-item">
                        <div class="info">
                            <h4>${data.title}</h4>
                            <p>${data.tags || 'No tags'}</p>
                        </div>
                        <button class="btn-delete" onclick="window.deleteProject('${id}')">
                            <i class="fas fa-trash-alt"></i> Delete
                        </button>
                    </div>
                `;
            }
        });
        revealOnScroll();
    } catch (e) { console.error("Error: ", e); }
};

window.deleteProject = async (id) => {
    if (confirm("Permanently delete this project from the database?")) {
        try {
            await deleteDoc(doc(db, "projects", id));
            fetchProjects();
        } catch (e) { alert("Action failed."); }
    }
};

// --- Security & Auth Logic ---
const setupAuth = () => {
    const portal = document.getElementById('admin-portal');
    const loginScreen = document.getElementById('login-screen');
    const dashboard = document.getElementById('admin-dashboard');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // Monitor Auth State
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loginScreen.style.display = 'none';
            dashboard.style.display = 'flex';
        } else {
            loginScreen.style.display = 'block';
            dashboard.style.display = 'none';
        }
    });

    // Login Handle
    loginBtn.onclick = async () => {
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;
        const originalText = loginBtn.innerText;
        
        loginBtn.innerText = "Authenticating...";
        loginBtn.disabled = true;

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (e) {
            alert("Invalid credentials. Please contact sys-admin.");
            console.error(e);
        } finally {
            loginBtn.innerText = originalText;
            loginBtn.disabled = false;
        }
    };

    // Logout Handle
    logoutBtn.onclick = () => signOut(auth);

    // Dashboard View Toggling
    document.querySelectorAll('.sidebar-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.view}-view`).classList.add('active');
        };
    });

    // Portal Controls
    document.getElementById('admin-login-btn').onclick = () => portal.style.display = 'flex';
    document.querySelectorAll('.close-portal').forEach(btn => {
        btn.onclick = () => portal.style.display = 'none';
    });
};

// --- New Project Form ---
const setupForm = () => {
    const form = document.getElementById('project-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-project');
        const originalBtn = btn.innerHTML;

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;

        const projectData = {
            title: document.getElementById('proj-title').value,
            description: document.getElementById('proj-desc').value,
            link: document.getElementById('proj-link').value,
            tags: document.getElementById('proj-tags').value,
            image: document.getElementById('proj-img').value,
            createdAt: serverTimestamp()
        };

        try {
            await addDoc(collection(db, "projects"), projectData);
            form.reset();
            alert("Project successfully published!");
            fetchProjects();
        } catch (e) {
            alert("Database Error: " + e.message);
        } finally {
            btn.innerHTML = originalBtn;
            btn.disabled = false;
        }
    };
};

// --- Animations ---
function revealOnScroll() {
    const animationClasses = ['.reveal-up', '.reveal-left', '.reveal-right', '.reveal-blur', '.reveal'];
    
    animationClasses.forEach(cls => {
        document.querySelectorAll(cls).forEach(el => {
            const top = el.getBoundingClientRect().top;
            if (top < window.innerHeight - 100) {
                el.classList.add('active');
            }
        });
    });
}

// --- Bootstrap ---
window.addEventListener('load', () => {
    initThree();
    fetchProjects();
    setupAuth();
    setupForm();

    setTimeout(() => {
        const loader = document.getElementById('loader-wrapper');
        loader.style.opacity = '0';
        setTimeout(() => loader.style.visibility = 'hidden', 800);
        revealOnScroll();
    }, 2000);
});

window.addEventListener('scroll', revealOnScroll);
