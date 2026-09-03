// NextMusic Desktop renderer 入口：HD 形态（与 Android hd flavor 同一 UI/业务层）
import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';

const root = createRoot(document.getElementById('root')!);

class EB extends React.Component<{children?: React.ReactNode}, {err: string | null}> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) { return { err: (e.stack || e.message || String(e)).slice(0, 600) }; }
  componentDidCatch(e: Error, info: { componentStack?: string }) {
    this.setState({ err: (this.state.err || '') + '\n|||STACK|||\n' + (info.componentStack || '').slice(0, 1200) });
  }
  render() { return this.state.err ? <pre style={{color:'#f66',fontSize:12,whiteSpace:'pre-wrap'}}>{this.state.err}</pre> : this.props.children; }
}
root.render(<EB><App /></EB>);


// 桌面窗口标题
document.title = 'NextMusic';
