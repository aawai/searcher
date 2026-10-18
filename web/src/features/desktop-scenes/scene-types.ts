/** 所有动态桌面场景组件共享的运行时输入。主题由宿主通过 CSS 属性传入。 */
export interface SceneProps {
    /** 为 false 时场景必须停止全部持续运动（标签隐藏、减少动态效果）。 */
    running: boolean;
}
