import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// =======================================
// المتغيرات الأساسية
// =======================================
let scene, camera, renderer, controls;
let autorotate = true;
let drawMode = false;

let sphereMesh = null;
let selectedPoints = [];
let paths = [];
let tempLine = null;
let pointMarkers = [];
let markerPreview = null;

let exportCanvas, exportContext;

// متغيرات Hotspots
let hotspotMode = null;

const pathColors = {
    EL: 0xffcc00,
    AC: 0x00ccff,
    WP: 0x0066cc,
    WA: 0xff3300,
    GS: 0x33cc33
};

let currentPathType = 'EL';
window.setCurrentPathType = (t) => {
    currentPathType = t;
    console.log('🎨 تغيير النوع إلى:', t);
    if (markerPreview) {
        markerPreview.material.color.setHex(pathColors[currentPathType]);
        markerPreview.material.emissive.setHex(pathColors[currentPathType]);
    }
};

// =======================================
// دوال الرسم الأساسية
// =======================================

// إعداد معاينة المؤشر
function setupMarkerPreview() {
    const geometry = new THREE.SphereGeometry(8, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: pathColors[currentPathType],
        emissive: pathColors[currentPathType],
        emissiveIntensity: 0.8
    });
    
    markerPreview = new THREE.Mesh(geometry, material);
    scene.add(markerPreview);
    markerPreview.visible = false;
}

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

function onClick(e) {
    if (!sphereMesh) return;
    if (e.target !== renderer.domElement) return;

    mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(sphereMesh);

    if (hits.length) {
        const point = hits[0].point.clone();
        
        if (hotspotMode) {
            addHotspot(point);
            hotspotMode = null;
            document.body.style.cursor = 'default';
        } else if (drawMode) {
            addPoint(point);
        }
    }
}

function onMouseMove(e) {
    if (!drawMode || !sphereMesh || !markerPreview) {
        if (markerPreview) markerPreview.visible = false;
        return;
    }
    
    if (e.target !== renderer.domElement) {
        markerPreview.visible = false;
        return;
    }

    mouse.x = (e.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(e.clientY / renderer.domElement.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(sphereMesh);

    if (hits.length) {
        markerPreview.position.copy(hits[0].point);
        markerPreview.visible = true;
    } else {
        markerPreview.visible = false;
    }
}

function addPoint(pos) {
    selectedPoints.push(pos.clone());
    console.log(`📍 نقطة ${selectedPoints.length} مضافة`);
    
    addPointMarker(pos);
    updateTempLine();
}

function addPointMarker(position) {
    const geometry = new THREE.SphereGeometry(6, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: pathColors[currentPathType],
        emissive: pathColors[currentPathType],
        emissiveIntensity: 0.6
    });
    
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    scene.add(marker);
    pointMarkers.push(marker);
}

function updateTempLine() {
    if (tempLine) {
        scene.remove(tempLine);
        tempLine.geometry.dispose();
        tempLine = null;
    }
    
    if (selectedPoints.length >= 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(selectedPoints);
        const material = new THREE.LineBasicMaterial({ 
            color: pathColors[currentPathType]
        });
        tempLine = new THREE.Line(geometry, material);
        scene.add(tempLine);
    }
}

function clearCurrentDrawing() {
    selectedPoints = [];
    
    pointMarkers.forEach(marker => scene.remove(marker));
    pointMarkers = [];
    
    if (tempLine) {
        scene.remove(tempLine);
        tempLine.geometry.dispose();
        tempLine = null;
    }
}

function saveCurrentPath() {
    if (selectedPoints.length < 2) {
        alert('⚠️ أضف نقطتين على الأقل');
        return;
    }

    try {
        if (tempLine) {
            scene.remove(tempLine);
            tempLine.geometry.dispose();
            tempLine = null;
        }
        
        createStraightPath(selectedPoints);
        clearCurrentDrawing();
        
        console.log('✅ تم حفظ المسار');
        
    } catch (error) {
        console.error('❌ خطأ في حفظ المسار:', error);
    }
}

function createStraightPath(points) {
    if (points.length < 2) return;
    
    const color = pathColors[currentPathType];
    const pathId = `path-${Date.now()}-${Math.random()}`;
    
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        
        const direction = new THREE.Vector3().subVectors(end, start);
        const distance = direction.length();
        
        if (distance < 5) continue;
        
        const cylinderRadius = 3.5;
        const cylinderHeight = distance;
        const cylinderGeo = new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderHeight, 12);
        
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
        
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.4,
            roughness: 0.2,
            metalness: 0.3
        });
        
        const cylinder = new THREE.Mesh(cylinderGeo, material);
        cylinder.applyQuaternion(quaternion);
        
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        cylinder.position.copy(center);
        
        cylinder.userData = {
            type: currentPathType,
            pathId: pathId,
            points: [start.clone(), end.clone()]
        };
        
        scene.add(cylinder);
        paths.push(cylinder);
    }
    
    if (points.length > 0) {
        const sphereGeo = new THREE.SphereGeometry(6, 24, 24);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.5
        });
        
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(points[0]);
        
        sphere.userData = {
            type: currentPathType,
            pathId: pathId,
            points: [points[0].clone()]
        };
        
        scene.add(sphere);
        paths.push(sphere);
    }
    
    console.log(`✅ تم إنشاء مسار بـ ${points.length-1} أجزاء`);
}

// =======================================
// دوال Hotspots
// =======================================
function addHotspot(position) {
    if (hotspotMode === 'INFO') {
        const title = prompt('أدخل عنوان المعلومات:');
        if (!title) return;
        const content = prompt('أدخل نص المعلومات:');
        if (!content) return;

        const geometry = new THREE.SphereGeometry(14, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffaa44,
            emissive: 0xffaa44,
            emissiveIntensity: 0.5
        });

        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(position);
        marker.userData = { 
            type: 'hotspot', 
            hotspotType: 'INFO',
            title: title,
            content: content
        };
        scene.add(marker);

        alert(`✅ تم إضافة نقطة معلومات`);
        
    } else if (hotspotMode === 'SCENE') {
        const targetScene = prompt('أدخل اسم المشهد المستهدف:');
        if (!targetScene) return;
        const description = prompt('أدخل وصفاً لهذه النقطة:') || `انتقال إلى ${targetScene}`;

        const geometry = new THREE.SphereGeometry(14, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: 0x44aaff,
            emissive: 0x44aaff,
            emissiveIntensity: 0.5
        });

        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(position);
        marker.userData = { 
            type: 'hotspot', 
            hotspotType: 'SCENE',
            targetScene: targetScene,
            description: description
        };
        scene.add(marker);

        alert(`✅ تم إضافة نقطة انتقال`);
    }
}

function rebuildHotspots(hotspots) {
    // هذه الدالة للاستخدام المستقبلي مع المشاهد المتعددة
}

// =======================================
// إعدادات التصدير
// =======================================
function setupExportCanvas() {
    exportCanvas = document.createElement('canvas');
    exportCanvas.width = 4096;
    exportCanvas.height = 2048;
    exportContext = exportCanvas.getContext('2d');
}

// =======================================
// أحداث لوحة المفاتيح
// =======================================
function onKeyDown(e) {
    if (!drawMode) return;

    switch(e.key) {
        case 'Enter':
            e.preventDefault();
            saveCurrentPath();
            break;
            
        case 'Backspace':
            e.preventDefault();
            if (selectedPoints.length > 0) {
                selectedPoints.pop();
                const last = pointMarkers.pop();
                if (last) scene.remove(last);
                updateTempLine();
            }
            break;
            
        case 'Escape':
            e.preventDefault();
            clearCurrentDrawing();
            break;
            
        case 'n':
        case 'N':
            e.preventDefault();
            clearCurrentDrawing();
            break;
            
        case '1': currentPathType = 'EL'; window.setCurrentPathType('EL'); break;
        case '2': currentPathType = 'AC'; window.setCurrentPathType('AC'); break;
        case '3': currentPathType = 'WP'; window.setCurrentPathType('WP'); break;
        case '4': currentPathType = 'WA'; window.setCurrentPathType('WA'); break;
        case '5': currentPathType = 'GS'; window.setCurrentPathType('GS'); break;
    }
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// =======================================
// إعداد الأحداث
// =======================================
function setupEvents() {
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    
    const toggleRotate = document.getElementById('toggleRotate');
    if (toggleRotate) {
        toggleRotate.onclick = () => {
            autorotate = !autorotate;
            controls.autoRotate = autorotate;
            toggleRotate.textContent = autorotate ? '⏸️ إيقاف التدوير' : '▶️ تشغيل التدوير';
        };
    }

    const toggleDraw = document.getElementById('toggleDraw');
    if (toggleDraw) {
        toggleDraw.onclick = () => {
            drawMode = !drawMode;
            if (drawMode) {
                toggleDraw.textContent = '⛔ إيقاف الرسم';
                toggleDraw.style.background = '#aa3333';
                document.body.style.cursor = 'crosshair';
                if (markerPreview) markerPreview.visible = true;
                controls.autoRotate = false;
            } else {
                toggleDraw.textContent = '✏️ تفعيل الرسم';
                toggleDraw.style.background = '#8f6c4a';
                document.body.style.cursor = 'default';
                if (markerPreview) markerPreview.visible = false;
                controls.autoRotate = autorotate;
                clearCurrentDrawing();
            }
        };
    }

    const finalizePath = document.getElementById('finalizePath');
    if (finalizePath) finalizePath.onclick = saveCurrentPath;

    const clearAll = document.getElementById('clearAll');
    if (clearAll) {
        clearAll.onclick = () => {
            if (confirm('هل أنت متأكد من مسح جميع المسارات؟')) {
                paths.forEach(path => scene.remove(path));
                paths = [];
                clearCurrentDrawing();
            }
        };
    }

    const hotspotScene = document.getElementById('hotspotScene');
    if (hotspotScene) {
        hotspotScene.onclick = () => { 
            hotspotMode = 'SCENE'; 
            document.body.style.cursor = 'cell'; 
        };
    }

    const hotspotInfo = document.getElementById('hotspotInfo');
    if (hotspotInfo) {
        hotspotInfo.onclick = () => { 
            hotspotMode = 'INFO'; 
            document.body.style.cursor = 'cell'; 
        };
    }
}

// =======================================
// تهيئة المشهد
// =======================================
function init() {
    console.log('🚀 بدء التهيئة...');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 0.1);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('container').appendChild(renderer.domElement);

    // الإضاءة
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(1, 1, 1);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight2.position.set(-1, -1, -0.5);
    scene.add(dirLight2);

    // التحكم
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.autoRotate = autorotate;
    controls.autoRotateSpeed = 0.5;
    controls.target.set(0, 0, 0);
    controls.update();

    loadPanorama();
    setupEvents();
    setupExportCanvas();
    animate();
}

// =======================================
// تحميل البانوراما
// =======================================
function loadPanorama() {
    console.log('🔄 جاري تحميل البانوراما...');
    
    const loader = new THREE.TextureLoader();
    
    loader.load(
        './textures/StartPoint.jpg',
        (texture) => {
            console.log('✅ تم تحميل الصورة');
            
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.x = -1;

            const geometry = new THREE.SphereGeometry(500, 128, 128);
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.BackSide
            });

            sphereMesh = new THREE.Mesh(geometry, material);
            scene.add(sphereMesh);
            
            const loaderEl = document.getElementById('loader');
            if (loaderEl) loaderEl.style.display = 'none';
            
            setupMarkerPreview();
        },
        (progress) => {
            console.log(`⏳ التحميل: ${Math.round((progress.loaded / progress.total) * 100)}%`);
        },
        (error) => {
            console.error('❌ فشل تحميل الصورة:', error);
        }
    );
}

// =======================================
// الرسوم المتحركة
// =======================================
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// =======================================
// بدء التشغيل
// =======================================
init();
