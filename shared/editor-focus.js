// Move the viewport only. A large selection keeps its midpoint visible at the current scale.
export function revealBounds(box,bounds,anchor){
  const padding=Math.min(box.w,box.h)*.06;
  const axis=(start,size,low,span,point)=>{
    if(span+padding*2>size)return point-size/2;
    if(low<start+padding)return low-padding;
    if(low+span>start+size-padding)return low+span+padding-size;
    return start;
  };
  return {...box,x:axis(box.x,box.w,bounds.x,bounds.w,anchor.x),y:axis(box.y,box.h,bounds.y,bounds.h,anchor.y)};
}
