import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { OBJLoader } from "jsm/loaders/OBJLoader.js";
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, collection, addDoc, getDocs, orderBy, query, deleteDoc, doc } from "firebase/firestore";

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
const analytics = getAnalytics(app);
const db = getFirestore(app);

// --- 3D Scene (UMBRAL) ---
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.setClearColor(0xffffff, 1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableZoom = false;
    controls.minPolarAngle = Math.PI / 3;
    controls.maxPolarAngle = Math.PI / 2.2;

    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform float uCircleSpacing;
      uniform float uLineWidth;
      uniform float uSpeed;
      uniform float uFadeEdge;
      uniform vec3 uCameraPosition;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;

      void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 uv = vUv;
        float dist = distance(uv, center);
        float animatedDist = dist - uTime * uSpeed;
        float circle = mod(animatedDist, uCircleSpacing);
        float distFromEdge = min(circle, uCircleSpacing - circle);
        float aaWidth = length(vec2(dFdx(animatedDist), dFdy(animatedDist))) * 2.0;
        float lineAlpha = 1.0 - smoothstep(uLineWidth - aaWidth, uLineWidth + aaWidth, distFromEdge);

        vec3 baseColor = mix(vec3(1.0), vec3(0.0), lineAlpha);
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(uCameraPosition - vPosition);
        vec3 lightDir = normalize(vec3(5.0, 10.0, 5.0));
        float NdotL = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = baseColor * (0.5 + 0.5 * NdotL);
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
        vec3 specular = vec3(1.0) * spec * 0.8;
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
        vec3 fresnelColor = vec3(1.0) * fresnel * 0.3;
        vec3 finalColor = diffuse + specular + fresnelColor;
        float edgeFade = smoothstep(0.5 - uFadeEdge, 0.5, dist);
        float alpha = 1.0 - edgeFade;
        gl_FragColor = vec4(finalColor, alpha);
      }
    `;

    const floorGeometry = new THREE.CircleGeometry(20, 200);
    const floorMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            uTime: { value: 0.0 },
            uCircleSpacing: { value: 0.06 },
            uLineWidth: { value: 0.02 },
            uSpeed: { value: 0.01 },
            uFadeEdge: { value: 0.2 },
            uCameraPosition: { value: new THREE.Vector3() },
        },
        side: THREE.DoubleSide,
        transparent: true,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    floor.receiveShadow = true;
    scene.add(floor);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const loader = new OBJLoader();
    loader.load(
        "https://cdn.jsdelivr.net/gh/danielyl123/person/person.obj",
        (object) => {
            object.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x888888,
                        roughness: 0.7,
                        metalness: 0.3,
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            const box = new THREE.Box3().setFromObject(object);
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);

            object.traverse((child) => {
                if (child.isMesh && child.geometry) {
                    child.geometry.translate(-center.x, -center.y, -center.z);
                }
            });

            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 4 / maxDim;
            object.scale.set(scale, scale, scale);
            object.position.set(0, 1, 0);
            object.rotation.y = Math.PI / 3;
            scene.add(object);
        }
    );

    let time = 0;
    const animate = () => {
        requestAnimationFrame(animate);
        time += 0.016;
        floorMaterial.uniforms.uTime.value = time;
        const cameraWorldPos = new THREE.Vector3();
        camera.getWorldPosition(cameraWorldPos);
        floorMaterial.uniforms.uCameraPosition.value.copy(cameraWorldPos);
        renderer.render(scene, camera);
        controls.update();
    };
    animate();

    window.addEventListener("resize", () => {
        const nw = container.clientWidth;
        const nh = container.clientHeight;
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
    });
};

// --- Project Rendering ---
const fetchProjects = async () => {
    const container = document.getElementById('projects-container');
    const adminList = document.getElementById('admin-projects-list');
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    
    try {
        const querySnapshot = await getDocs(q);
        container.innerHTML = '';
        if (adminList) adminList.innerHTML = '';
        
        if (querySnapshot.empty) {
            container.innerHTML = '<p>No projects yet.</p>';
            if (adminList) adminList.innerHTML = '<p>No projects to manage.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            
            // User view card
            container.innerHTML += `
                <div class="project-card glass reveal">
                    <div class="project-img">
                        <img src="${data.image || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97'}" alt="${data.title}">
                    </div>
                    <div class="project-info">
                        <h3>${data.title}</h3>
                        <p>${data.description}</p>
                        <div class="project-tags">
                            ${(data.tags || '').split(',').map(tag => `<span>${tag.trim()}</span>`).join('')}
                        </div>
                        ${data.link ? `<a href="${data.link}" target="_blank" class="btn btn-outline" style="margin-top: 1rem;">View Project</a>` : ''}
                    </div>
                </div>
            `;

            // Admin List Item
            if (adminList) {
                adminList.innerHTML += `
                    <div class="admin-list-item">
                        <div class="info">
                            <h4>${data.title}</h4>
                            <p style="font-size: 0.8rem; color: #aaa;">${id}</p>
                        </div>
                        <div class="actions">
                            <button class="btn-delete" onclick="deleteProject('${id}')">Delete</button>
                        </div>
                    </div>
                `;
            }
        });
        
        revealOnScroll();

    } catch (e) {
        console.error("Error fetching: ", e);
    }
};

window.deleteProject = async (id) => {
    if (confirm("Are you sure you want to delete this project?")) {
        try {
            await deleteDoc(doc(db, "projects", id));
            fetchProjects();
        } catch (e) {
            alert("Delete failed.");
        }
    }
};

// --- Dashboard Logic ---
const setupDashboard = () => {
    const modal = document.getElementById('admin-modal');
    const loginSection = document.getElementById('admin-login-section');
    const dashboardSection = document.getElementById('admin-main-dashboard');
    const loginBtn = document.getElementById('login-btn');
    const adminEmailInput = document.getElementById('admin-email');
    
    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
        };
    });

    // Login Logic
    loginBtn.onclick = () => {
        if (adminEmailInput.value === 'youssefosama@gmail.com') {
            loginSection.style.display = 'none';
            dashboardSection.style.display = 'block';
        } else {
            alert("Access Denied.");
        }
    };

    // Close Modal
    document.querySelector('.close').onclick = () => modal.style.display = "none";
    window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; };

    // New Project
    document.getElementById('add-proj-btn').onclick = async () => {
        const title = document.getElementById('proj-title').value;
        const desc = document.getElementById('proj-desc').value;
        const link = document.getElementById('proj-link').value;
        const tags = document.getElementById('proj-tags').value;
        const img = document.getElementById('proj-img').value;

        if (!title || !desc) return alert("Fill required fields.");

        try {
            await addDoc(collection(db, "projects"), {
                title, description: desc, link, tags, image: img,
                createdAt: new Date().toISOString()
            });
            alert("Added!");
            fetchProjects();
            // Reset form
            document.querySelectorAll('.admin-form input, .admin-form textarea').forEach(i => i.value = '');
        } catch (e) {
            alert("Error adding.");
        }
    };
};

// --- Animations ---
function revealOnScroll() {
    document.querySelectorAll('.reveal').forEach(reveal => {
        const windowHeight = window.innerHeight;
        const revealTop = reveal.getBoundingClientRect().top;
        if (revealTop < windowHeight - 100) reveal.classList.add('active');
    });
}

// --- Init ---
window.addEventListener('load', () => {
    initThree();
    fetchProjects();
    setupDashboard();
    
    // Open modal via lock button
    document.getElementById('admin-login-btn').onclick = () => {
        document.getElementById('admin-modal').style.display = 'block';
    };

    setTimeout(() => {
        document.getElementById('loader-wrapper').style.opacity = '0';
        document.getElementById('loader-wrapper').style.visibility = 'hidden';
        revealOnScroll();
    }, 1500);
});

window.addEventListener('scroll', revealOnScroll);
