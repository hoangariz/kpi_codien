import React, { useEffect } from 'react';

export default function CsdbPage() {
  useEffect(() => {
    window.location.replace('/kpi');
  }, []);
  return null;
}
