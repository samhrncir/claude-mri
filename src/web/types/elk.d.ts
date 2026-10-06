// Vite's `?worker` import of elkjs's prebuilt worker script.
declare module 'elkjs/lib/elk-worker.min.js?worker' {
  const WorkerFactory: new () => Worker
  export default WorkerFactory
}
