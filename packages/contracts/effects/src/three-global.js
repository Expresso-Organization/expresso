// Vanta 효과는 모듈을 읽을 때 window.THREE를 본다. 효과 묶음의 맨 앞에서 지면의 three(import map)를 거기에 둔다.
import * as THREE from "three";
window.THREE = THREE;
