import * as THREE from 'three';
import { MutableRefObject } from 'react';
import { Polygon, ViewMode } from '../../components/PolygonViewer/types';
import { normalizeCoordinates } from '../../components/PolygonViewer/utils';
import { PolygonRendererFacade } from '../../lib/threejs/PolygonRendererFacade';
import { PolygonMeshFacade } from '../../lib/threejs/PolygonMeshFacade';
import { log } from '../../lib/logUtils';
import { 
  RenderingErrorHandler, 
  RenderingErrorType, 
  withErrorHandling 
} from '../../lib/errorHandling';
import { getBackendBaseUrl } from '../apiUtils';
import { eventBus, EventTypes } from '../eventBus';
