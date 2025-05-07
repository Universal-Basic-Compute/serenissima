import { NextApiRequest, NextApiResponse } from 'next';
import { loadAllResources } from '../../lib/resourceUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const resources = await loadAllResources();
      res.status(200).json(resources);
    } catch (error) {
      console.error('Error loading resources:', error);
      res.status(500).json({ error: 'Failed to load resources' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
