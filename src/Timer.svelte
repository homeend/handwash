<script>
    import {createEventDispatcher} from 'svelte'; 
    import ProgressBar from './ProgressBar.svelte';
    
    const total_time = 20;
    const dispatcher = createEventDispatcher()

    let in_progress = false;
    let counter = 0;

    function startTimer(){
        if(in_progress)
            return;

        in_progress = true;
        const interval_id = setInterval(() => {            
            counter++;
            if(counter > total_time){
                clearInterval(interval_id);
                in_progress = false;
                counter = 0;
                dispatcher('timer_finished', {msg: 'time has run out....'});
            }

        }, 1000);
    }
</script>

<style>
    h2 {
        margin: 0;
    }
    .start {
        background-color: rgb(153, 72, 72);
        width: 100%;
        margin: 10px 0;
    }
    .start[disabled] {
        background-color: rgb(194, 194, 194);
        cursor: not-allowed;
    }
</style>

<div bp="grid">
    <h2 bp="offset-5@md 4@md 12@sm">
        Seconds Left: {total_time - counter}
    </h2>
</div>

<ProgressBar progress={counter} total={total_time}/>

<div bp="grid">
    <button disabled={in_progress} on:click={startTimer} bp="offset-5@md 4@md 12@sm" class="start">Start</button>
</div>