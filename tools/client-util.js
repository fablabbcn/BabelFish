// Log in a list called id
function log(id, msg) {
	var ele = document.getElementById(id);
	if (!ele) {
		ele = document.createElement('ul');
		ele.id = id;
		document.body.appendChild(ele);
	}

	ele.innerHTML += '<li>' + msg + '</li>';
}

function str(obj) {
	return JSON.stringify(obj);
}
