import { MutableRefObject } from 'react';

export interface PolygonViewerProps {
  getSnapshotWithCache: <T>(getSnapshotFn: () => T, dependencies: any[]) => T;
  ref?: MutableRefObject<any>;
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'contracts' | 'governance';
  [key: string]: any; // Allow additional props
}
