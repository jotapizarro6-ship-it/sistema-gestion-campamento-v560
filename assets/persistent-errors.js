(()=>{
  'use strict';
  if(typeof showMessage!=='function')return;
  let hideTimer=null;
  showMessage=function(msg,type='ok'){
    const el=$('#globalMessage');
    if(!el)return;
    if(hideTimer){clearTimeout(hideTimer);hideTimer=null;}
    el.className=`global-message notice ${type}`;
    el.textContent=msg;
    el.classList.remove('hidden');
    if(type!=='error'){
      hideTimer=setTimeout(()=>el.classList.add('hidden'),6000);
    }
  };
})();
